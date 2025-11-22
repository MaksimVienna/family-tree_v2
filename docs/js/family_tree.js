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

svg.style("background-color", "#f8f8f8").style("display", "block");
const g = svg.append("g");

// ==================== LAYOUT FUNCTION ====================
const applyFinalLayout = (data, width) => {
    return new Promise(resolve => {
        const orderScript = document.createElement("script");
        orderScript.src = "data/manual_order_regrouped.js";
        orderScript.onerror = () => {
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
                resolve({ data, maxLayoutX: width, maxLayoutY: 0 });
                return;
            }

            let allX = [];
            for (const gen in finalXCoordinates) allX = allX.concat(finalXCoordinates[gen]);
            const minX = d3.min(allX);
            const maxX = d3.max(allX);

            const treeWidth = maxX - minX;
            const drawRange = width - CONFIG.NODE_RADIUS * 4;
            const scaleFactor = drawRange / treeWidth;
            const totalPadding = width - (treeWidth * scaleFactor + CONFIG.NODE_RADIUS * 4);
            const xOffset = CONFIG.NODE_RADIUS * 2 + totalPadding / 2;

            const scaleX = d3.scaleLinear().domain([minX, maxX]).range([0, treeWidth * scaleFactor]);

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

                    const scaledX = scaleX(coords[i]) + xOffset;
                    person.x = scaledX;
                    person.y = +person.Generation * CONFIG.BASE_Y_UNIT + CONFIG.NODE_RADIUS;
                    person.r = CONFIG.NODE_RADIUS;

                    const nameSafe = person.Name ? person.Name.toLowerCase().replace(/\W+/g, '_') : '';
                    person.folderId = `id${person.PersonID}_${nameSafe}`;
                }
            }

            const maxTreeX = d3.max(data, d => d.x);
            const minTreeX = d3.min(data, d => d.x);
            const maxLayoutX = maxTreeX - minTreeX + CONFIG.NODE_RADIUS * 2;

            const LABEL_MAX_OFFSET = 28;
            const maxLayoutY = d3.max(data, d => d.y) + CONFIG.NODE_RADIUS + LABEL_MAX_OFFSET;

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
        const { data } = result;

        // ==================== DRAW PARTNER LINES ====================
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

        // ==================== DRAW PARENT → CHILD LINES ====================
        const genGroups = d3.group(data, d => d.Generation);

        genGroups.forEach(nodes => {
            function drawParentDroplet(g, parentNodes) {
                if (!parentNodes?.length) return null;

                const r = CONFIG.NODE_RADIUS;
                const midX = d3.mean(parentNodes, d => d.x);
                const midY = d3.mean(parentNodes, d => d.y);
                const width = parentNodes.length === 1 ? r * 2.5 : Math.max(r * 5, Math.abs(parentNodes[0].x - parentNodes[1].x) + r);
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
                const [fatherID, motherID] = parentKey.split("_");
                let parentNodes = [];

                if (fatherID) {
                    const f = data.find(n => n.PersonID.toString() === fatherID);
                    if (f) parentNodes.push(f);
                }
                if (motherID) {
                    const m = data.find(n => n.PersonID.toString() === motherID);
                    if (m) parentNodes.push(m);
                }
                if (!parentNodes.length) return;

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
            .on("click", (event, d) => {
                const repoName = 'family-tree_v2';
                const basePath = window.location.hostname.includes('github.io') ? `/${repoName}` : '.';
                window.open(`${basePath}/person.html?id=${d.PersonID}`, "_blank");
            });

        nodeGroup.append("circle")
            .attr("r", d => d.r || CONFIG.NODE_RADIUS)
            .attr("fill", "#ddd")
            .attr("stroke", "#333");

        nodeGroup.append("image")
            .attr("xlink:href", d =>
                d.Photo && d.Photo !== ""
                    ? `images/${d.Photo}`
                    : `https://placehold.co/${(d.r || CONFIG.NODE_RADIUS) * 2}x${(d.r || CONFIG.NODE_RADIUS) * 2}/bbbbbb/333333?text=?`
            )
            .attr("clip-path", d => `url(#clip-${d.PersonID})`)
            .attr("x", d => -(d.r || CONFIG.NODE_RADIUS))
            .attr("y", d => -(d.r || CONFIG.NODE_RADIUS))
            .attr("height", d => (d.r || CONFIG.NODE_RADIUS) * 2)
            .attr("width", d => (d.r || CONFIG.NODE_RADIUS) * 2)
            .attr("preserveAspectRatio", "xMidYMid slice");

        // --- Multiline name rendering ---
const MAX_CHARS = 9;
function splitName(name) {
    if (!name) return [""];
    if (name.length <= MAX_CHARS) return [name];
    const mid = Math.floor(name.length / 2);
    const vowels = /[aeiouауоыиэяюёе]/i;
    // search left from mid
    for (let i = mid; i > 1; i--) {
        if (vowels.test(name[i])) return [name.slice(0, i), name.slice(i)];
    }
    // fallback split
    return [name.slice(0, mid), name.slice(mid)];
}

const nameGroup = nodeGroup.append("text")
    .attr("text-anchor", "middle")
    .attr("font-size", "12px");

nameGroup.each(function(d) {
    const lines = splitName(d['Name-ru']);
    const r = d.r || CONFIG.NODE_RADIUS;
    const lineHeight = 14;
    const baseY = r + 10;
    lines.forEach((line, i) => {
        d3.select(this)
            .append("tspan")
            .attr("x", 0)
            .attr("dy", i === 0 ? baseY : lineHeight)
            .text(line);
    });
});

        // ==================== ZOOM & PAN ====================
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", event => g.attr("transform", event.transform));

        svg.call(zoom);

        // ==========================================================
        // ⭐ UNIVERSAL AUTO-FIT — FINAL PERFECT VERSION
        // ==========================================================
        setTimeout(() => {
            const bbox = g.node().getBBox();

            const scale = Math.min(
                width / bbox.width,
                height / bbox.height
            ) * 0.98;

            const tx = (width - bbox.width * scale) / 2 - bbox.x * scale;
            const ty = (height - bbox.height * scale) / 2 - bbox.y * scale;

            svg.transition()
                .duration(750)
                .call(
                    zoom.transform,
                    d3.zoomIdentity.translate(tx, ty).scale(scale)
                );
        }, 0);

    }).catch(error => console.error("Error in layout:", error));
});
