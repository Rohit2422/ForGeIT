class SidebarMenu extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { position: relative; display: block; }

        .icon-wrapper {
          position: fixed;
          top: 8px;
          left: 8px;
          z-index: 10001;
        }
        .icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px; height: 32px;
        }
        svg { width: 28px; height: 28px; }

        /* Dots */
        .dot {
          fill: var(--accent-color, #007acc);
          transition: transform 0.3s ease, opacity 0.3s ease;
        }
        .dot1 { transform: translateY(-6px); }
        .dot2 { transform: translateY(0px); }
        .dot3 { transform: translateY(6px); }

        /* Cross lines */
        .cross {
          stroke: var(--accent-color, #007acc);
          stroke-width: 2.5;
          stroke-linecap: round;
          opacity: 0;
          transition: opacity 0.3s ease, transform 0.3s ease;
        }

        /* Active: morph to X */
        .active .dot1,
        .active .dot2,
        .active .dot3 {
          opacity: 0;
          transform: scale(0.5);
        }
        .active .cross1 {
          opacity: 1;
          transform: rotate(45deg);
        }
        .active .cross2 {
          opacity: 1;
          transform: rotate(-45deg);
        }

        /* Overlay */
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,.35);
          display: none;
          z-index: 9998;
        }
        .overlay.show { display: block; }
        
        /* Sidebar */
        .sidebar {
          position: fixed;
          top: 0; left: 0;
          height: 100%; width: 260px;
          background: #fff;
          border-right: 1px solid #e5e7eb;
          box-shadow: 2px 0 8px rgba(0,0,0,.15);
          transform: translateX(-100%);
          transition: transform .25s ease, opacity .25s ease;
          z-index: 9999;
          display: flex; flex-direction: column;
        }
        .sidebar.show { transform: translateX(0); }

        .header {
          padding: 14px;
          border-bottom: 1px solid #f0f0f0;
          font: 600 20px/1.2 system-ui, sans-serif;
          margin-top: 20px;
          color: #000;
        }

        .content {
          flex: 1;
          padding: 14px;
          font: 14px/1.4 system-ui, sans-serif;
          overflow-y: auto;
        }

        .content ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .content li { margin: 8px 0; }
        .content li a {
          color: #000;
          text-decoration: none;
          font: 15px system-ui, sans-serif;
          display: block;
          padding: 8px 12px;
          border-radius: 6px;
          transition: background 0.2s;
        }
        .content li a:hover {
          background: #f3f4f6;
          color: #000;
        }

        .footer-menu {
          padding: 14px;
          border-top: 1px solid #f0f0f0;
        }
        .footer-menu ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .footer-menu li { margin: 10px 0; }
        .footer-menu a {
          color: #3b82f6;
          text-decoration: none;
        }
        .footer-menu a:hover { text-decoration: underline; }
      </style>

      <!-- Toggle button -->
      <div class="icon-wrapper">
        <button id="toggleBtn" class="icon-btn" aria-label="Menu">
          <svg viewBox="0 0 24 24">
            <circle class="dot dot1" cx="12" cy="12" r="1.5"/>
            <circle class="dot dot2" cx="12" cy="12" r="1.5"/>
            <circle class="dot dot3" cx="12" cy="12" r="1.5"/>
            <line class="cross cross1" x1="5" y1="5" x2="19" y2="19"/>
            <line class="cross cross2" x1="19" y1="5" x2="5" y2="19"/>
          </svg>
        </button>
      </div>

      <div id="overlay" class="overlay"></div>

      <!-- Sidebar -->
      <aside id="sidebar" class="sidebar" aria-hidden="true">
        <div class="header"><slot name="menu-title">Quick Menu</slot></div>
        <div class="content">
          <ul>
  <li><a href="about.html" target="_blank">About</a></li>
  <li><a href="products.html" target="_blank">Products</a></li>
  <li><a href="help.html" target="_blank">Help</a></li>
</ul>
        </div>
        <div class="footer-menu">
          <ul>
            <li><a href="Privacy and Policy.html" target="_blank">Privacy Policy</a></li>
            <li><a href="Terms and Conditions.html" target="_blank">Terms and Conditions</a></li>
          </ul>
        </div>
      </aside>
    `;

    const sidebar = root.getElementById("sidebar");
    const overlay = root.getElementById("overlay");
    const toggleBtn = root.getElementById("toggleBtn");

    const open = () => {
      sidebar.classList.add("show");
      overlay.classList.add("show");
      toggleBtn.classList.add("active");
    };
    const close = () => {
      sidebar.classList.remove("show");
      overlay.classList.remove("show");
      toggleBtn.classList.remove("active");
    };

    toggleBtn.addEventListener("click", () => {
      if (sidebar.classList.contains("show")) close();
      else open();
    });
    overlay.addEventListener("click", close);
    this.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }
}
customElements.define("sidebar-menu", SidebarMenu);
