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
const svg = d3.select("svg");
const width = +svg.attr("width");
const height = +svg.attr("height");

svg.style("background-color", "#f8f8f8")
   .style("display", "block");

const g = svg.append("g");

// ==================== LAYOUT FUNCTION ====================
const applyFinalLayout = (data, width) => {
    return new Promise(resolve => {
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
            const scaleX = d3.scaleLinear()
                .domain([minX, maxX])
                .range([CONFIG.NODE_RADIUS * 2, width - CONFIG.NODE_RADIUS * 2]);

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

                    const scaledX = scaleX(coords[i]);
                    person.x = scaledX;
                    person.y = +person.Generation * CONFIG.BASE_Y_UNIT + CONFIG.NODE_RADIUS;
                    person.r = CONFIG.NODE_RADIUS;

                    // compute GitHub-safe folderId
                    const nameSafe = person.Name ? person.Name.toLowerCase().replace(/\W+/g, '_') : '';
                    person.folderId = `id${person.PersonID}_${nameSafe}`;
                }
            }

            const maxLayoutX = width;
            const maxLayoutY = d3.max(data, d => d.y) + CONFIG.NODE_RADIUS;
            resolve({ data, maxLayoutX, maxLayoutY });
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
                window.open(`../person.html?id=${d.folderId}`, "_blank");
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

        // ==================== MARK NODES WITH BIO PAGES ====================
        nodeGroup.each(function(d) {
            if (!d.PersonID) return;
            const txtFilePath = `bio/${d.folderId}/${d.folderId}.txt`;

            fetch(txtFilePath, { method: "HEAD" })
                .then(response => {
                    if (response.ok) {
                        d3.select(this)
                            .append("circle")
                            .attr("r", 6)
                            .attr("cx", (d.r || CONFIG.NODE_RADIUS) * 0.7)
                            .attr("cy", -(d.r || CONFIG.NODE_RADIUS) * 0.7)
                            .attr("fill", "limegreen")
                            .attr("stroke", "#333")
                            .attr("stroke-width", 1);
                    }
                })
                .catch(() => {}); 
        });

        // ==================== ZOOM & PAN ====================
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => g.attr("transform", event.transform));

        svg.call(zoom);
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.scale(scale));

    }).catch(error => console.error("Error in layout:", error));
});
