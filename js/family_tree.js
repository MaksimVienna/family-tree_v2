// ==================== CONFIGURABLE CONSTANTS ====================
const CONFIG = {
    NODE_RADIUS: 20,
    BASE_Y_UNIT: 150,
    PARTNER_LINE_COLOR: "#444",
    PARTNER_LINE_WIDTH: 2,
    PARENT_LINE_COLOR: "#888",
    PARENT_LINE_WIDTH: 2,
    CURVE_OFFSET_FACTOR: 0.5,
};

// ==================== SVG SETUP ====================
// Note: This script assumes d3.js is loaded and the HTML contains an <svg width="W" height="H"></svg> element.
const svg = d3.select("svg");
const width = +svg.attr("width");
const height = +svg.attr("height");

svg.style("background-color", "#f8f8f8")
    .style("display", "block");

const g = svg.append("g");

// ==================== LAYOUT FUNCTION ====================
const applyFinalLayout = (data, width) => {
    return new Promise(resolve => {
        // Load external data scripts (assumed to be available in a 'data/' directory)
        const orderScript = document.createElement("script");
        orderScript.src = "data/manual_order_regrouped.js";
        orderScript.onerror = () => {
            console.warn("manual_order_regrouped.js not found, loading manual_order.js");
            orderScript.src = "data/manual_order.js";
            document.head.appendChild(orderScript);
        };

        const coordsScript = document.createElement("script");
        coordsScript.src = "data/final_x_coordinates.js";

        let orderLoaded = false;
        let coordsLoaded = false;

        const tryBuild = () => {
            if (!orderLoaded || !coordsLoaded) return;

            if (typeof manualOrderFull === "undefined" || typeof finalXCoordinates === "undefined") {
                console.error("manualOrderFull or finalXCoordinates not found.");
                resolve({ data, maxLayoutX: width, maxLayoutY: 0 });
                return;
            }

            let allX = [];
            for (const gen in finalXCoordinates) {
                allX = allX.concat(finalXCoordinates[gen]);
            }
            const minX = d3.min(allX);
            const maxX = d3.max(allX);

            // --- HORIZONTAL CENTERING LOGIC (Correct as previously implemented) ---
            const treeWidth = maxX - minX;
            // The range for the scaled x-coordinates, taking node radius into account
            const drawRange = width - (CONFIG.NODE_RADIUS * 4); 
            
            // Calculate the scaling factor based on the tree width and available drawing range
            const scaleFactor = drawRange / treeWidth;

            // Calculate the total padding/empty space
            const totalPadding = width - (treeWidth * scaleFactor + CONFIG.NODE_RADIUS * 4);
            
            // Calculate the offset to center the tree
            const xOffset = CONFIG.NODE_RADIUS * 2 + totalPadding / 2;

            const scaleX = d3.scaleLinear()
                .domain([minX, maxX])
                .range([0, treeWidth * scaleFactor]);
            
            // --- END HORIZONTAL CENTERING LOGIC ---

            const genGroups = d3.group(data, d => d.Generation);
            for (const [gen, nodes] of genGroups.entries()) {
                const orderedIds = manualOrderFull[gen];
                const coords = finalXCoordinates[gen];
                if (!orderedIds || !coords) continue;

                const count = Math.min(orderedIds.length, coords.length);
                for (let i = 0; i < count; i++) {
                    const id = orderedIds[i];
                    const person = nodes.find(n => n.PersonID.toString() === id.toString());
                    if (!person) continue;

                    // Apply the scale and the centering offset
                    const scaledX = scaleX(coords[i]) + xOffset;
                    
                    person.x = scaledX;
                    person.y = +person.Generation * CONFIG.BASE_Y_UNIT + CONFIG.NODE_RADIUS;
                    person.r = CONFIG.NODE_RADIUS;

                    // compute GitHub-safe folderId
                    const nameSafe = person.Name ? person.Name.toLowerCase().replace(/\W+/g, '_') : '';
                    person.folderId = `id${person.PersonID}_${nameSafe}`;
                }
            }

            // Recalculate maxLayoutX (total drawing width)
            const maxTreeX = d3.max(data, d => d.x);
            const minTreeX = d3.min(data, d => d.x);
            const maxLayoutX = maxTreeX - minTreeX + CONFIG.NODE_RADIUS * 2; // + 2*R to account for the node itself

            // ------------------------------------------------------------------
            // 🎯 FIX: Incorporate the text label height into maxLayoutY
            // The lowest element is the second text label, which has a vertical offset (dy) of +28.
            // maxLayoutY = max node center Y + node radius + max text offset
            // ------------------------------------------------------------------
            const LABEL_MAX_OFFSET = 28 ; 
            const maxLayoutY = d3.max(data, d => d.y) + CONFIG.NODE_RADIUS + LABEL_MAX_OFFSET;
            
            resolve({ data, maxLayoutX: maxLayoutX, maxLayoutY });
        };

        orderScript.onload = () => { orderLoaded = true; tryBuild(); };
        coordsScript.onload = () => { coordsLoaded = true; tryBuild(); };

        document.head.appendChild(orderScript);
        document.head.appendChild(coordsScript);
    });
};

// ==================== MAIN EXECUTION ====================
d3.json("data/family_data.json").then(familyData => {
    applyFinalLayout(familyData, width).then(result => {
        const { data, maxLayoutX, maxLayoutY } = result;
        // Scale factor for fitting the content, using the newly corrected maxLayoutY
        const scale = Math.min(width / maxLayoutX, height / maxLayoutY) * 0.95;

        // ==================== PARTNER LINES ====================
        data.forEach(person => {
            if (person.PartnerID) {
                const partners = person.PartnerID.toString().split(',').map(p => p.trim());
                partners.forEach(pId => {
                    const partner = data.find(n => n.PersonID.toString() === pId);
                    if (partner && person.x !== undefined && partner.x !== undefined && person.PersonID < partner.PersonID) {
                        const r = person.r || CONFIG.NODE_RADIUS;
                        g.append("line")
                            .attr("x1", Math.min(person.x, partner.x) + r)
                            .attr("x2", Math.max(person.x, partner.x) - r)
                            .attr("y1", person.y)
                            .attr("y2", partner.y)
                            .attr("stroke", CONFIG.PARTNER_LINE_COLOR)
                            .attr("stroke-width", CONFIG.PARTNER_LINE_WIDTH);
                    }
                });
            }
        });

        // ==================== PARENT → CHILD CONNECTIONS ====================
        const genGroups = d3.group(data, d => d.Generation);
        genGroups.forEach(nodes => {
            function drawParentDroplet(g, parentNodes) {
                if (!parentNodes || parentNodes.length === 0) return null;

                const r = CONFIG.NODE_RADIUS;
                const midX = d3.mean(parentNodes, d => d.x);
                const midY = d3.mean(parentNodes, d => d.y);

                const width = parentNodes.length === 1
                    ? r * 2.5
                    : Math.max(r * 5, Math.abs(parentNodes[0].x - parentNodes[1].x) + r);
                const height = 1.5 * r * 2;
                const cornerRadius = r * 0.5;

                g.append("rect")
                    .attr("x", midX - width / 2)
                    .attr("y", midY - height / 2 + r / 3)
                    .attr("width", width)
                    .attr("height", height)
                    .attr("rx", cornerRadius)
                    .attr("ry", cornerRadius)
                    .attr("fill", "#f0f0f0")
                    .attr("stroke", CONFIG.PARENT_LINE_COLOR)
                    .attr("stroke-width", CONFIG.PARENT_LINE_WIDTH)
                    .lower();

                return { x: midX, y: midY - height / 2 + r / 3 + height };
            }

            const parentGroups = d3.groups(nodes, d => `${d.FatherID || ''}_${d.MotherID || ''}`);
            parentGroups.forEach(([parentKey, children]) => {
                const parentIDs = parentKey.split("_");
                let parentNodes = [];
                if (parentIDs[0]) {
                    const father = data.find(n => n.PersonID.toString() === parentIDs[0]);
                    if (father) parentNodes.push(father);
                }
                if (parentIDs[1]) {
                    const mother = data.find(n => n.PersonID.toString() === parentIDs[1]);
                    if (mother) parentNodes.push(mother);
                }
                if (parentNodes.length === 0) return;

                const parentBottom = drawParentDroplet(g, parentNodes);
                if (!parentBottom) return;

                const childMidX = d3.mean(children, d => d.x);
                const childMidY = d3.mean(children, d => d.y - CONFIG.NODE_RADIUS);
                const splitY = parentBottom.y + 0.75 * (childMidY - parentBottom.y);

                const mainCurve = d3.path();
                mainCurve.moveTo(parentBottom.x, parentBottom.y);
                const controlYMain = parentBottom.y + CONFIG.CURVE_OFFSET_FACTOR * (splitY - parentBottom.y);
                mainCurve.bezierCurveTo(parentBottom.x, controlYMain, childMidX, controlYMain, childMidX, splitY);

                g.append("path")
                    .attr("d", mainCurve.toString())
                    .attr("fill", "none")
                    .attr("stroke", CONFIG.PARENT_LINE_COLOR)
                    .attr("stroke-width", CONFIG.PARENT_LINE_WIDTH);

                children.forEach(person => {
                    const path = d3.path();
                    path.moveTo(childMidX, splitY);
                    const controlYChild = splitY + CONFIG.CURVE_OFFSET_FACTOR * (person.y - CONFIG.NODE_RADIUS - splitY);
                    path.bezierCurveTo(childMidX, controlYChild, person.x, controlYChild, person.x, person.y - CONFIG.NODE_RADIUS);

                    g.append("path")
                        .attr("d", path.toString())
                        .attr("fill", "none")
                        .attr("stroke", CONFIG.PARENT_LINE_COLOR)
                        .attr("stroke-width", CONFIG.PARENT_LINE_WIDTH);
                });
            });
        });

        // ==================== DRAW NODES ====================
        const defs = g.append("defs");
        defs.selectAll(".clip-circle")
            .data(data)
            .enter()
            .append("clipPath")
            .attr("id", d => `clip-${d.PersonID}`)
            .append("circle")
            .attr("r", d => d.r || CONFIG.NODE_RADIUS)
            .attr("cx", 0)
            .attr("cy", 0);

        const nodeGroup = g.selectAll(".node")
            .data(data)
            .enter()
            .append("g")
            .attr("class", "node")
            .attr("transform", d => `translate(${d.x},${d.y})`)
            .style("cursor", "pointer")
            .on("click", function(event, d) {
                if (!d.PersonID) return;
                // Use GitHub-safe folderId
                // --- Open person page (works both locally and on GitHub Pages) ---
                const repoName = 'family-tree_v2';  // adjust if repo name changes
                const basePath = window.location.hostname.includes('github.io')
                    ? `/${repoName}`
                    : '.';
                //window.open(`${basePath}/person.html?id=${d.folderId}`, "_blank");
                window.open(`${basePath}/person.html?id=${d.PersonID}`, "_blank");

            });

        nodeGroup.append("circle")
            .attr("r", d => d.r || CONFIG.NODE_RADIUS)
            .attr("fill", "#ddd")
            .attr("stroke", "#333");

        nodeGroup.append("image")
            .attr("xlink:href", d => d.Photo && d.Photo !== "" 
                ? `images/${d.Photo}` 
                : `https://placehold.co/${(d.r || CONFIG.NODE_RADIUS)*2}x${(d.r || CONFIG.NODE_RADIUS)*2}/bbbbbb/333333?text=?`)
            .attr("clip-path", d => `url(#clip-${d.PersonID})`)
            .attr("x", d => -(d.r || CONFIG.NODE_RADIUS))
            .attr("y", d => -(d.r || CONFIG.NODE_RADIUS))
            .attr("height", d => (d.r || CONFIG.NODE_RADIUS) * 2)
            .attr("width", d => (d.r || CONFIG.NODE_RADIUS) * 2)
            .attr("preserveAspectRatio", "xMidYMid slice");

        nodeGroup.append("text")
            .attr("dy", d => (d.r || CONFIG.NODE_RADIUS) + 12)
            .attr("text-anchor", "middle")
            .attr("font-size", "12px")
            .text(d => d['Name-ru']);

        nodeGroup.append("text") 
            .attr("dy", d => (d.r || CONFIG.NODE_RADIUS) + 28) 
            .attr("text-anchor", "middle") 
            .attr("font-size", "10px") 
            .attr("fill", "#555") 
            .text(d => d.PersonID);

        // ==================== ZOOM & PAN (Centering Logic) ====================
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => g.attr("transform", event.transform));

        svg.call(zoom);

        // Calculate the necessary translation (Tx, Ty) for perfect centering
        // maxLayoutX and maxLayoutY now represent the true, full dimensions of the content.
        const tx = (width - maxLayoutX * scale) / 2;
        const ty = (height - maxLayoutY * scale) / 2;

        // Apply the initial scale and translation
        svg.transition().duration(750).call(
            zoom.transform, 
            d3.zoomIdentity.translate(tx, -ty*2).scale(scale)
        );

    }).catch(error => console.error("Error in layout:", error));
});
