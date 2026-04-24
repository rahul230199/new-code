/* =========================================================
   AXO NETWORKS — GLOBAL TOAST SYSTEM
========================================================= */

const Toast = {

  show(message, type = "success", duration = 4000) {

    let container = document.getElementById("toastContainer");

    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.style.position = "fixed";
      container.style.top = "20px";
      container.style.right = "20px";
      container.style.zIndex = "9999";
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.gap = "10px";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");

    toast.style.minWidth = "250px";
    toast.style.padding = "12px 16px";
    toast.style.borderRadius = "6px";
    toast.style.color = "#fff";
    toast.style.fontSize = "14px";
    toast.style.fontWeight = "500";
    toast.style.boxShadow = "0 6px 16px rgba(0,0,0,0.2)";
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    toast.style.transition = "all 0.3s ease";

    toast.style.background =
      type === "error" ? "#e74c3c"
      : type === "warning" ? "#f39c12"
      : "#2ecc71";

    toast.innerText = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(0)";
    }, 10);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(20px)";
      setTimeout(() => {
        container.removeChild(toast);
      }, 300);
    }, duration);
  },

  success(message) {
    this.show(message, "success");
  },

  error(message) {
    this.show(message, "error");
  },

  warning(message) {
    this.show(message, "warning");
  }
};

export default Toast;