// products.js (finalized)
// Requires your existing CSS (popup-overlay, popup-content, .zoom-in / .zoom-out styles)
// and the hidden workflow repository in the DOM (#workflowsRepo) if you want the detailed workflows.

document.addEventListener("DOMContentLoaded", () => {
  // --------------------
  // Basic elements
  // --------------------
  const cards = document.querySelectorAll(".feature-card");
  const steps = document.querySelectorAll(".step");
  const themeToggle = document.getElementById("themeToggle");

  // --------------------
  // Scroll reveal
  // --------------------
  const reveal = () => {
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      if (rect.top < window.innerHeight - 80) {
        card.classList.add("visible");
      }
    });

    steps.forEach((step, i) => {
      const rect = step.getBoundingClientRect();
      if (rect.top < window.innerHeight - 60) {
        setTimeout(() => step.classList.add("visible"), i * 200);
      }
    });
  };
  window.addEventListener("scroll", reveal, { passive: true });
  reveal();

  // --------------------
  // Theme toggle
  // --------------------
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      document.body.classList.toggle("dark-mode");
    });
  }

  // --------------------
  // Tooltip fallback
  // --------------------
  const tooltips = document.querySelectorAll(".tooltip");
  tooltips.forEach(el => {
    el.addEventListener("mouseenter", () => {
      const tipText = el.getAttribute("data-tip");
      if (!tipText) return;

      const tooltipBox = document.createElement("div");
      tooltipBox.className = "tooltip-box";
      tooltipBox.innerText = tipText;
      document.body.appendChild(tooltipBox);

      const rect = el.getBoundingClientRect();
      // center horizontally and place above the element
      tooltipBox.style.left = (rect.left + rect.width / 2) + "px";
      tooltipBox.style.top = (rect.top - 35 + window.scrollY) + "px";

      el._tooltip = tooltipBox;
    });

    el.addEventListener("mouseleave", () => {
      if (el._tooltip) {
        el._tooltip.remove();
        el._tooltip = null;
      }
    });
  });

  // --------------------
  // Popup / Zoom logic
  // --------------------
  // Try to use an existing static popup (#feature-popup) if present; otherwise create one.
  let popup = document.getElementById("feature-popup");
  let createdPopup = false;

  if (!popup) {
    createdPopup = true;
    popup = document.createElement("div");
    popup.className = "popup-overlay";
    popup.setAttribute("id", "feature-popup"); // give it an id for debugging
    popup.innerHTML = `
      <div class="popup-content">
        <button class="popup-close" type="button" aria-label="Close popup">&times;</button>
        <h3 id="popup-title" style="margin-top:0;"></h3>
        <div id="popup-body" class="popup-body"></div>
      </div>
    `;
    document.body.appendChild(popup);
  }

  const popupContent = popup.querySelector(".popup-content");
  const popupCloseBtn = popup.querySelector(".popup-close");
  const popupTitleEl = popup.querySelector("#popup-title");
  const popupBodyEl = popup.querySelector("#popup-body") || popup.querySelector(".popup-body");

  // small helper to normalize strings for matching
  function normalizeText(s = "") {
    return String(s)
      .replace(/\u00A0/g, " ")      // NBSP -> space
      .replace(/\s+/g, " ")         // collapse spaces
      .trim()
      .toLowerCase();
  }

  // find a workflow node from #workflowsRepo that best matches the featureTitle
  function findWorkflowNode(featureTitle) {
    const repo = document.getElementById("workflowsRepo");
    if (!repo) return null;

    const nodes = Array.from(repo.querySelectorAll("[data-feature]"));
    const normTitle = normalizeText(featureTitle);

    // 1) exact match on data-feature
    let match = nodes.find(n => normalizeText(n.getAttribute("data-feature")) === normTitle);
    if (match) return match;

    // 2) exact match on inner heading (h4/h3)
    match = nodes.find(n => {
      const h = n.querySelector("h4, h3");
      return h && normalizeText(h.textContent) === normTitle;
    });
    if (match) return match;

    // 3) partial includes (repo contains title substring) - pick first reasonable
    match = nodes.find(n => {
      const candidate = normalizeText(n.getAttribute("data-feature") || (n.querySelector("h4, h3")?.textContent || ""));
      return candidate && (candidate.includes(normTitle) || normTitle.includes(candidate));
    });
    if (match) return match;

    return null;
  }

  // open popup safely (handles animation classes)
  function openPopup({ title = "", html = "" } = {}) {
    if (!popup) return;

    // set content
    if (popupTitleEl) popupTitleEl.textContent = title;
    if (popupBodyEl) {
      // if html is a node, append clone; if string, set innerHTML
      if (typeof html === "string") {
        popupBodyEl.innerHTML = html;
      } else if (html instanceof Node) {
        popupBodyEl.innerHTML = "";
        popupBodyEl.appendChild(html.cloneNode(true));
      } else {
        popupBodyEl.innerHTML = "";
      }
    }

    // show overlay + animate
    popup.classList.add("active");
    // ensure popupContent uses zoom-in animation
    popupContent.classList.remove("zoom-out");
    // force reflow -> restart animation
    void popupContent.offsetWidth;
    popupContent.classList.add("zoom-in");

    // lock scroll and focus close button
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (popupCloseBtn) popupCloseBtn.focus();
  }

  // close popup with animation
  function closePopup() {
    if (!popup || !popupContent) return;
    // if already not active, do nothing
    if (!popup.classList.contains("active")) return;

    // animate out
    popupContent.classList.remove("zoom-in");
    popupContent.classList.add("zoom-out");

    // wait for animation end on content then hide overlay and cleanup
    const onAnimEnd = () => {
      popup.classList.remove("active");
      popupContent.classList.remove("zoom-out");
      // restore scroll
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      popupContent.removeEventListener("animationend", onAnimEnd);
    };

    popupContent.addEventListener("animationend", onAnimEnd, { once: true });

    // safety fallback: if animationend doesn't fire, force hide after 400ms
    setTimeout(() => {
      if (popup.classList.contains("active")) {
        popup.classList.remove("active");
        popupContent.classList.remove("zoom-out");
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";
      }
    }, 500);
  }

  // Overlay click: close when clicking outside popup-content
  popup.addEventListener("click", (ev) => {
    if (ev.target === popup) {
      closePopup();
    }
  });

  // close button
  if (popupCloseBtn) {
    popupCloseBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      closePopup();
    });
  }

  // ESC key to close
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && popup.classList.contains("active")) {
      closePopup();
    }
  });

  // --------------------
  // Feature-card clicks -> show workflow
  // --------------------
  const featureCards = document.querySelectorAll(".feature-card");
  featureCards.forEach(card => {
    card.style.cursor = "pointer";
    card.addEventListener("click", (ev) => {
      // prefer data-feature attr if present
      const df = card.getAttribute("data-feature");
      const heading = card.querySelector("h3, h4, h2")?.textContent?.trim() || df || "Feature";
      let workflowNode = null;

      // If we have a hidden workflow repo, try to find a match
      workflowNode = findWorkflowNode(df || heading);

      if (workflowNode) {
        // clone workflow content into popup body
        const clone = workflowNode.cloneNode(true);
        // remove data-* attributes from clone for clean display
        clone.removeAttribute("data-group");
        clone.removeAttribute("data-feature");

        // option: present title from clone's h4 if available
        const titleNode = clone.querySelector("h4, h3");
        const titleText = titleNode ? titleNode.textContent.trim() : heading;

        // place clone children into popup body
        const fragment = document.createDocumentFragment();
        // remove the heading inside clone (we'll use popup title)
        if (titleNode) titleNode.remove();
        Array.from(clone.childNodes).forEach(n => fragment.appendChild(n.cloneNode(true)));

        openPopup({ title: titleText, html: fragment });
      } else {
        // fallback: show the card's immediate content (title + p)
        const desc = card.querySelector("p")?.innerHTML || "";
        openPopup({ title: heading, html: `<p>${desc}</p>` });
      }
    });

    // keyboard accessibility: Enter / Space to open
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        card.click();
      }
    });
    // ensure focusable
    if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "0");
  });

  // Expose for debugging if needed
  window.__forGeITPopup = {
    openPopup,
    closePopup,
    findWorkflowNode
  };
});
