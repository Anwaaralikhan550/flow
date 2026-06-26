(function removeLegacyFlowBridgePanel() {
  const panelId = "session-bridge-panel";

  function removePanel() {
    document.getElementById(panelId)?.remove();
    for (const element of document.querySelectorAll("aside, div")) {
      const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (text.includes("FLOW BRIDGE") && text.includes("Generate cost") && text.includes("Premium lock")) {
        element.remove();
      }
    }
  }

  removePanel();
  window.setInterval(removePanel, 500);
})();
