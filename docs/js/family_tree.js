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

const GENDER_COLORS = {
    M: "#4A90E2",   // soft blue
    F: "#E26A8A",   // soft red-pink
    U: "#999999"    // unknown gender
};

// Inject minimal tooltip CSS (so you can paste one file; optional if you already have CSS)
(function injectTooltipCSS() {
    const css = `
    .name-tooltip {
        position: absolute;
        padding: 6px 10px;
        background: rgba(255, 255, 255, 1);
        color: #000000ff;
        border-radius: 6px;
        font-size: 16px;
        pointer-events: none;
        transition: opacity 0.12s ease;
        white-space: nowrap;
        z-index: 10000;
    }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
})();

// === Tooltip for full names ===
const tooltip = d3.select("body")
    .append("div")
    .attr("class", "name-tooltip")
    .style("opacity", 0);

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

// Clip-paths for photos
defs.selectAll(".clip-circle")
    .data(data)
    .enter()
    .append("clipPath")
    .attr("id", d => `clip-${d.PersonID}`)
    .append("circle")
    .attr("r", d => d.r || CONFIG.NODE_RADIUS)
    .attr("cx", 0)
    .attr("cy", 0);

// Main node groups
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

// Main background circle
nodeGroup.append("circle")
    .attr("r", d => d.r || CONFIG.NODE_RADIUS)
    .attr("fill", "#ddd")
    .attr("stroke", "#333");

// Gender-dependent thin ring
nodeGroup.append("circle")
    .attr("r", d => (d.r || CONFIG.NODE_RADIUS) * 1.0)
    .attr("fill", "none")
    .attr("stroke", d => {
        const gender = (d.Gender || "U").toUpperCase();
        return GENDER_COLORS[gender] || GENDER_COLORS.U;
    })
    .attr("stroke-width", 5);

// Person photo
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

        // -------------------------
        // === Name rendering: SMART pixel-based truncation (syllable-aware)
        // -------------------------

        // Create a canvas context for accurate pixel-width measurement
        const textMeasureCanvas = document.createElement("canvas");
        const textMeasureCtx = textMeasureCanvas.getContext("2d");

        // Use the same font as the rendered <text> (keep in sync if you change the font-size/family below)
        const NODE_LABEL_FONT_SIZE = 11;
        const NODE_LABEL_FONT_FAMILY = "sans-serif";
        textMeasureCtx.font = `${NODE_LABEL_FONT_SIZE}px ${NODE_LABEL_FONT_FAMILY}`;

        function textWidthPx(str) {
            return textMeasureCtx.measureText(str).width;
        }

        // Vowels for smart syllable-aware cut (latin + cyrillic)
        const VOWELS = /[aeiouауоыиэяюёеAEIOUАУОЫИЭЯЮЁЕ]/;

        // Truncate to pixel width while trying to break at a vowel/syllable boundary.
        // Strategy:
        // 1. If full fits, return full.
        // 2. Binary search to find max characters that fit with ellipsis.
        // 3. From that candidate, look backwards a bit for a vowel to cut after (so truncation is at a syllable boundary).
        // 4. Return truncated + ellipsis.
        function smartTruncate(full, maxPx) {
            if (!full) return "";
            if (textWidthPx(full) <= maxPx) return full;

            // Binary search for maximum length that fits with ellipsis appended.
            let lo = 0;
            let hi = full.length;
            let best = "";
            while (lo <= hi) {
                const mid = Math.floor((lo + hi) / 2);
                const candidate = full.slice(0, mid);
                const w = textWidthPx(candidate + "…");
                if (w <= maxPx) {
                    best = candidate;
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }

            if (!best) {
                // If even 1 char + ellipsis doesn't fit, return ellipsis only or first char + ellipsis forced.
                return full.slice(0, 1) + "…";
            }

            // Try to find a nice vowel boundary near the end of `best`
            const lookback = Math.min(6, best.length); // check up to last 6 chars
            for (let i = best.length - 1; i >= best.length - lookback; i--) {
                if (VOWELS.test(best[i]) && i >= 1) {
                    const nicer = best.slice(0, i + 1); // keep the vowel at end of chunk
                    if (textWidthPx(nicer + "…") <= maxPx) {
                        return nicer + "…";
                    }
                }
            }

            // fallback to best + ellipsis
            return best + "…";
        }

        // Now render the (possibly truncated) short name under the node and attach tooltip
        const nameGroup = nodeGroup.append("text")
            .attr("text-anchor", "middle")
            .attr("font-size", NODE_LABEL_FONT_SIZE + "px")
            .attr("font-family", NODE_LABEL_FONT_FAMILY)
            .style("cursor", "default");

        nameGroup.each(function(d) {
            const full = d["Name-ru"] || "";
            const r = d.r || CONFIG.NODE_RADIUS;
            const dy = r + 12; // distance below circle center to start text

            // maximum width is node diameter minus a small margin
            const maxTextWidth = (r * 2) * 1.2;

            const short = smartTruncate(full, maxTextWidth);

            d3.select(this)
                .append("tspan")
                .attr("x", 0)
                .attr("dy", dy)
                .text(short);
        });

// Tooltip interactions (show full name + last name + dates + gender color)
nameGroup
  .on("mouseover", function(event, d) {
      const first = d["Name-ru"] || "";
      const last = d["LastName-ru"] || "";
      const dob = d.BirthDate || "";
      const dod = d.DeathDate || "";

      let dates = "";
      if (dob && dod) dates = `${dob} — ${dod}`;
      else if (dob) dates = dob;
      else if (dod) dates = `† ${dod}`;

      const gender = (d.Gender || "U").toUpperCase();
      const color = GENDER_COLORS[gender] || GENDER_COLORS.U;




      tooltip
          .style("opacity", 1)
          .style("border-left", `6px solid ${color}`)
          .html(`
              <div style="font-weight:600; color:${color}">${first}${last ? " " + last : ""}</div>
              ${dates ? `<div style="font-size:13px; opacity:0.9; margin-top:3px">${dates}</div>` : ""}
          `);
  })
  .on("mousemove", function(event) {
      tooltip
          .style("left", (event.pageX + 12) + "px")
          .style("top", (event.pageY + 12) + "px");
  })
  .on("mouseout", function() {
      tooltip.style("opacity", 0);
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
            // If the group has no dimensions yet, bail gracefully
            if (!g.node()) return;
            const bbox = g.node().getBBox();

            // If bbox width/height are zero (empty graph), skip transform
            if (!bbox.width || !bbox.height) return;

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
}).catch(error => console.error("Error loading family data:", error));
