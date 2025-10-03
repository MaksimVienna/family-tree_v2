const svg = d3.select("svg");
const width = +svg.attr("width");
const height = +svg.attr("height");

// Apply styles to the SVG container to ensure it takes up the full space 
// and has a visible background for zooming
svg.style("background-color", "#f8f8f8")
   .style("display", "block");

// Create a group element (g) to hold all the tree elements (nodes and lines).
// This group is what will be transformed by the zoom behavior.
const g = svg.append("g"); 

// --- COLOR PALETTE DEFINITION ---
// Colors for distinct sibling groups (will cycle through this list)
const SIBLING_COLORS = [
    "#FF8C00", // DarkOrange
    "#1E90FF", // DodgerBlue
    "#3CB371", // MediumSeaGreen
    "#9932CC"  // DarkOrchid
];
// Color for individual children (no siblings)
const INDIVIDUAL_CHILD_COLOR = "#DC143C"; // Crimson Red
// Color for spouse connections
const SPOUSE_COLOR = "#555"; // Dark Gray

// Layout settings
const genSpacing = 150;
const yOffset = 10;
const spouseOffset = 60;
const nodeRadius = 20;
// Base length for sibling vertical connection lines (used for grouping)
const baseLineLength = nodeRadius * 1.55; 
const groupIndexFactor = 0.28;
const siblingGap = spouseOffset * 2; // Kept for reference, but shifting logic is removed

d3.json("data/family_data.json").then(data => {

    // ----------------------------------------------------
    // --- 1. Initialization and Data Mapping ---
    // ----------------------------------------------------
    const idMap = {};
    data.forEach(d => { idMap[d.PersonID] = d; });
    data.forEach(d => { d.y = +d.Generation * genSpacing + yOffset; });

    // Group nodes by generation
    const genGroups = {};
    data.forEach(d => {
        if (!genGroups[d.Generation]) genGroups[d.Generation] = [];
        genGroups[d.Generation].push(d);
    });

    // ------------------------------
    // --- 2. Assign X positions (Automatic Mode Only: Partners first) ---
    // ------------------------------
    const assigned = new Set();

    for (let gen in genGroups) {
        const nodes = genGroups[gen];
        
        // Automatic mode
        let xCounter = 1;
        const spacing = width / (nodes.length + 1);

        // 1. Partners first (ensuring lower ID is processed first)
        nodes.forEach(d => {
            if (assigned.has(d.PersonID)) return;
            if (d.PartnerID && idMap[d.PartnerID] && +d.PersonID < +d.PartnerID) {
                const partner = idMap[d.PartnerID];
                d.x = spacing * xCounter++;
                partner.x = d.x + spouseOffset;
                xCounter++;
                assigned.add(d.PersonID);
                assigned.add(partner.PersonID);
            }
        });

        // 2. Remaining nodes
        nodes.forEach(d => {
            if (!assigned.has(d.PersonID)) {
                d.x = spacing * xCounter++;
                assigned.add(d.PersonID);
            }
        });
    }

    // ----------------------------------------------------
    // --- 3. Sibling Grouping (For Line Drawing, No Shifting) ---
    // ----------------------------------------------------
    const siblingGroupsByGen = {};
    for (let gen in genGroups) {
        const nodes = genGroups[gen];
        const drawn = new Set();
        let groupIndex = 0;

        nodes.forEach(d => {
            if (!d.SiblingID || drawn.has(d.PersonID)) return;

            const siblingIDs = d.SiblingID.split(",").map(s => s.trim());
            const siblings = [d, ...siblingIDs.map(id => idMap[id]).filter(p => p)];

            // Sort siblings left to right based on their current X position
            siblings.sort((a,b)=>a.x - b.x);

            // Calculate color based on group index
            const colorIndex = groupIndex % SIBLING_COLORS.length;
            const groupColor = SIBLING_COLORS[colorIndex];

            // Update group info (for drawing the parent connection lines)
            const xMin = Math.min(...siblings.map(s => s.x));
            const xMax = Math.max(...siblings.map(s => s.x));
            // Sibling group line length is calculated based on groupIndex
            const lineLength = baseLineLength * (1 + groupIndexFactor * groupIndex);
            const yTop = siblings[0].y - lineLength;

            siblingGroupsByGen[gen] = siblingGroupsByGen[gen] || [];
            siblingGroupsByGen[gen].push({
                siblings,
                xCenter: (xMin + xMax)/2,
                yTop,
                parents: siblings.map(s => [s.FatherID, s.MotherID]),
                groupColor: groupColor // Store the color for later drawing
            });

            siblings.forEach(sib => drawn.add(sib.PersonID));
            groupIndex++;
        });
    }

    // ----------------------------------------------------
    // --- 4. Drawing Lines ---
    // ----------------------------------------------------

    // --- Draw spouse lines ---
    data.forEach(d => {
        if (d.PartnerID && idMap[d.PartnerID] && +d.PersonID < +d.PartnerID) {
            const partner = idMap[d.PartnerID];
            g.append("line") // Use 'g' instead of 'svg'
                .attr("x1", d.x).attr("y1", d.y)
                .attr("x2", partner.x).attr("y2", partner.y)
                .attr("stroke", SPOUSE_COLOR) // Dark Gray for spouses
                .attr("stroke-width", 2);
        }
    });

    // --- Draw sibling vertical and horizontal lines (Grouping Lines) ---
    Object.values(siblingGroupsByGen).flat().forEach(group => {
        const siblings = group.siblings;
        const color = group.groupColor; // Use the assigned group color

        siblings.forEach(sib => {
            g.append("line") // Use 'g' instead of 'svg'
                .attr("x1", sib.x).attr("y1", sib.y)
                .attr("x2", sib.x).attr("y2", group.yTop)
                .attr("stroke", color) // Sibling group color
                .attr("stroke-width", 2);
        });

        g.append("line") // Use 'g' instead of 'svg'
            .attr("x1", Math.min(...siblings.map(s => s.x)))
            .attr("y1", group.yTop)
            .attr("x2", Math.max(...siblings.map(s => s.x)))
            .attr("y2", group.yTop)
            .attr("stroke", color) // Sibling group color
            .attr("stroke-width", 2);
    });

    // -------------------------------------------------------------
    // --- 5. Center Children under Parents (with Collision Check and Dynamic Line Length) ---
    // -------------------------------------------------------------
    for (let gen in genGroups) {
        const nodes = genGroups[gen];
        // Counter for people without siblings in this generation
        let nonSiblingIndex = 0; 
        
        nodes.forEach(d => {
            // Only process individual children (not part of a sibling group)
            if (d.SiblingID) return;

            // Skip if no parents exist
            if (!( (d.FatherID && idMap[d.FatherID]) || (d.MotherID && idMap[d.MotherID]) )) return;

            const parentIDs = [];
            if (d.FatherID && idMap[d.FatherID]) parentIDs.push(d.FatherID);
            if (d.MotherID && idMap[d.MotherID]) parentIDs.push(d.MotherID);
            if (parentIDs.length === 0) return;

            const parentXs = parentIDs.map(id => idMap[id].x);
            // Calculate desired X position (midpoint of parents)
            const desiredX = parentXs.reduce((a,b)=>a+b,0)/parentXs.length;

            // Collision check
            const minSpacing = nodeRadius * 2;
            let safeX = desiredX;
            let iteration = 0;
            // Check for collision with *any* other node in the generation
            while (nodes.some(n => n !== d && Math.abs(n.x - safeX) < minSpacing) && iteration < 20) {
                safeX += minSpacing; 
                iteration++;
            }
            d.x = safeX; // Set the final X position

            // DYNAMIC LINE LENGTH CALCULATION
            // Modulate the base length using the nonSiblingIndex
            const lengthMultiplier = 1 + nonSiblingIndex * 0.2; // 20% increase for each subsequent node
            const baseConnLength = 0.3 * genSpacing; // Base length for non-sibling connectors
            const lineLength = baseConnLength * lengthMultiplier; 
            
            const yTop = d.y - lineLength;
            
            nonSiblingIndex++; // Increment the index for the next non-sibling node 

            // --- Draw Parent-to-Child Connection Lines (using 'g') ---

            // Vertical line (child to connection point)
            g.append("line")
                .attr("x1", d.x).attr("y1", d.y)
                .attr("x2", d.x).attr("y2", yTop)
                .attr("stroke", INDIVIDUAL_CHILD_COLOR) // Crimson Red for individual children
                .attr("stroke-width", 2);

            // Orthogonal connection point logic
            const parentXCenter = parentXs.reduce((a,b)=>a+b,0)/parentXs.length;
            const parentYs = parentIDs.map(id => idMap[id].y);
            const parentYCenter = parentYs.reduce((a,b)=>a+b,0)/parentYs.map(p => p).length;
            const yMid = yTop - (yTop - parentYCenter)/2;

            // Vertical segment (from yTop to yMid)
            g.append("line")
                .attr("x1", d.x).attr("y1", yTop)
                .attr("x2", d.x).attr("y2", yMid)
                .attr("stroke", INDIVIDUAL_CHILD_COLOR) // Crimson Red for individual children
                .attr("stroke-width", 2);

            // Horizontal segment (from child's vertical line to parent's vertical line)
            g.append("line")
                .attr("x1", d.x).attr("y1", yMid)
                .attr("x2", parentXCenter).attr("y2", yMid)
                .attr("stroke", INDIVIDUAL_CHILD_COLOR) // Crimson Red for individual children
                .attr("stroke-width", 2);

            // Vertical segment (from yMid to parent's level)
            g.append("line")
                .attr("x1", parentXCenter).attr("y1", yMid)
                .attr("x2", parentXCenter).attr("y2", parentYCenter)
                .attr("stroke", INDIVIDUAL_CHILD_COLOR) // Crimson Red for individual children
                .attr("stroke-width", 2);
        });
    }

    // --- Sibling-to-parent orthogonal connections (Lines) (using 'g') ---
    Object.values(siblingGroupsByGen).flat().forEach(group => {
        const parentIDs = new Set();
        group.parents.forEach(p => p.forEach(id => { if (id && idMap[id]) parentIDs.add(id); }));
        if (parentIDs.size === 0) return;

        const color = group.groupColor; // Use the assigned group color
        
        const parentXs = [...parentIDs].map(id => idMap[id].x);
        const parentYs = [...parentIDs].map(id => idMap[id].y);
        const parentXCenter = parentXs.reduce((a,b)=>a+b,0)/parentXs.length;
        const parentYCenter = parentYs.reduce((a,b)=>a+b,0)/parentYs.length;
        const yMid = (group.yTop + parentYCenter)/2;

        // Vertical segment (group top line to yMid)
        g.append("line")
            .attr("x1", group.xCenter).attr("y1", group.yTop)
            .attr("x2", group.xCenter).attr("y2", yMid)
            .attr("stroke", color) // Sibling group color
            .attr("stroke-width", 2);

        // Horizontal segment (group center to parent center)
        g.append("line")
            .attr("x1", group.xCenter).attr("y1", yMid)
            .attr("x2", parentXCenter).attr("y2", yMid)
            .attr("stroke", color) // Sibling group color
            .attr("stroke-width", 2);

        // Vertical segment (yMid to parent level)
        g.append("line")
            .attr("x1", parentXCenter).attr("y1", yMid)
            .attr("x2", parentXCenter).attr("y2", parentYCenter)
            .attr("stroke", color) // Sibling group color
            .attr("stroke-width", 2);
    });

    // ------------------------------
    // --- 6. Draw nodes (using 'g') ---
    // ------------------------------
    const nodeGroup = g.selectAll(".node")
        .data(data)
        .enter()
        .append("g")
        .attr("class","node")
        .attr("transform", d => `translate(${d.x},${d.y})`);

    nodeGroup.append("circle").attr("r", nodeRadius);
    nodeGroup.append("text")
        .attr("dy", 5)
        .attr("text-anchor", "middle")
        .text(d => d['Name-ru']); 
        
    // ------------------------------
    // --- 7. Implement Zoom and Pan ---
    // ------------------------------
    const zoom = d3.zoom()
        .scaleExtent([0.1, 4]) // Allow zoom out to 10% and zoom in to 400%
        .on("zoom", (event) => {
            // Apply the transformation (translation and scale) to the 'g' element
            g.attr("transform", event.transform);
        });

    // Apply the zoom behavior to the main svg element
    svg.call(zoom);

    // Optional: Zoom to fit the entire content initially (especially if it overflows)
    // Find the bounds of the rendered content
    const bbox = g.node().getBBox();
    
    // Calculate the scale and translation required to fit the bounding box within the SVG view
    const scaleX = width / bbox.width;
    const scaleY = height / bbox.height;
    const scale = Math.min(scaleX, scaleY) * 0.95; // Use 95% of the calculated scale for padding
    
    // Calculate translation to center the content after scaling
    const translateX = (width / 2) - (bbox.x + bbox.width / 2) * scale;
    const translateY = (height / 2) - (bbox.y + bbox.height / 2) * scale;
    
    // Create a new transform object and apply it
    const initialTransform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);
    
    // Apply the initial transform smoothly
    svg.transition().duration(750).call(zoom.transform, initialTransform);
});
