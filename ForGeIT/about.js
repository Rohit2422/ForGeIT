document.addEventListener("DOMContentLoaded", () => {
  const cards = document.querySelectorAll(".card");
  const steps = document.querySelectorAll(".step");
  const themeToggle = document.getElementById("themeToggle");

  // Scroll reveal
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

  window.addEventListener("scroll", reveal);
  reveal();

  // Theme toggle
  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
  });

  // Tooltip fallback (JS-based)
  const tooltips = document.querySelectorAll(".tooltip");

  tooltips.forEach(el => {
    el.addEventListener("mouseenter", () => {
      const tipText = el.getAttribute("data-tip");
      if (!tipText) return;

      // create tooltip element
      const tooltipBox = document.createElement("div");
      tooltipBox.className = "tooltip-box";
      tooltipBox.innerText = tipText;
      document.body.appendChild(tooltipBox);

      const rect = el.getBoundingClientRect();
      tooltipBox.style.left = rect.left + rect.width / 2 + "px";
      tooltipBox.style.top = rect.top - 35 + window.scrollY + "px";

      el._tooltip = tooltipBox;
    });

    el.addEventListener("mouseleave", () => {
      if (el._tooltip) {
        el._tooltip.remove();
        el._tooltip = null;
      }
    });
  });
});
