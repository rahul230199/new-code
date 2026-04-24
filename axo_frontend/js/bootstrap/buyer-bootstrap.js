import { initBuyerShell } from "../modules/buyer/core/buyer-shell.js";
import { RouteGuard } from "../guards/routeGuard.js";
import { AuthManager as Auth } from "../core/authManager.js";

function showBootLoader() {

  const existing = document.getElementById("bootLoader");
  if (existing) return;

  const loader = document.createElement("div");
  loader.id = "bootLoader";
  loader.style.cssText = `
    position:fixed;
    inset:0;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#ffffff;
    z-index:9999;
  `;

  loader.innerHTML = `
    <div id="bootLottie" style="width:200px;height:200px;"></div>
  `;

  document.body.appendChild(loader);

  if (window.lottie) {
    window.lottie.loadAnimation({
      container: document.getElementById("bootLottie"),
      renderer: "svg",
      loop: true,
      autoplay: true,
      path: "/assets/lottie/dashboard-loader.json"
    });
  }
}

function hideBootLoader() {
  const loader = document.getElementById("bootLoader");
  if (loader) loader.remove();
}

document.addEventListener("DOMContentLoaded", async () => {

  showBootLoader();

  const allowed = RouteGuard.protect({
    requireAuth: true,
    role: "buyer"
  });

  if (!allowed) return;

  // Wait for next frame so loader paints
  await new Promise(resolve => requestAnimationFrame(resolve));

  initBuyerShell();

  // Small delay ensures first route fully mounts
  setTimeout(() => {
    hideBootLoader();
  }, 500);
});