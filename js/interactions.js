(function () {
  function setupInteractions({ els, showView, renderEvent, renderSearch, renderEventFinder, selectEntity }) {
    els.navButtons.forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
    els.homeBrand.addEventListener("click", (event) => { event.preventDefault(); showView("home"); });
    window.addEventListener("hashchange", () => showView(location.hash.slice(1) || "home"));
    document.querySelectorAll("[data-go-search]").forEach((button) => button.addEventListener("click", () => showView("search")));
    document.querySelectorAll("[data-go-events]").forEach((button) => button.addEventListener("click", () => showView("events")));
    els.recentEvents.addEventListener("click", (event) => {
      const card = event.target.closest("[data-event-name]");
      if (!card) return;
      renderEvent(card.dataset.eventName);
      showView("events");
    });

    let suppressTimelineClick = false;
    let timelineDrag = null;
    els.eventTimeline.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      timelineDrag = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: els.eventTimeline.scrollLeft, moved: false };
      els.eventTimeline.setPointerCapture(event.pointerId);
      els.eventTimeline.classList.add("is-dragging");
    });
    els.eventTimeline.addEventListener("pointermove", (event) => {
      if (!timelineDrag || timelineDrag.pointerId !== event.pointerId) return;
      const distance = event.clientX - timelineDrag.startX;
      if (Math.abs(distance) > 5) timelineDrag.moved = true;
      els.eventTimeline.scrollLeft = timelineDrag.scrollLeft - distance;
    });
    function finishTimelineDrag(event) {
      if (!timelineDrag || timelineDrag.pointerId !== event.pointerId) return;
      suppressTimelineClick = timelineDrag.moved;
      timelineDrag = null;
      els.eventTimeline.classList.remove("is-dragging");
      window.setTimeout(() => { suppressTimelineClick = false; }, 300);
    }
    els.eventTimeline.addEventListener("pointerup", finishTimelineDrag);
    els.eventTimeline.addEventListener("pointercancel", finishTimelineDrag);
    els.eventTimeline.addEventListener("wheel", (event) => {
      if (window.matchMedia("(max-width: 640px)").matches || els.eventTimeline.scrollWidth <= els.eventTimeline.clientWidth) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      els.eventTimeline.scrollLeft += event.deltaY;
      event.preventDefault();
    }, { passive: false });
    els.eventTimeline.addEventListener("click", (event) => {
      if (suppressTimelineClick) { event.preventDefault(); suppressTimelineClick = false; return; }
      const node = event.target.closest("[data-event-name]")
        || document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-event-name]");
      if (!node) return;
      if (window.matchMedia("(hover: none)").matches && !node.classList.contains("is-revealed")) {
        els.eventTimeline.querySelectorAll(".is-revealed").forEach((item) => item.classList.remove("is-revealed"));
        node.classList.add("is-revealed");
        node.focus();
        return;
      }
      renderEvent(node.dataset.eventName);
      showView("events");
      requestAnimationFrame(() => els.eventDetail.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
    els.eventSearch.addEventListener("input", renderEventFinder);
    els.eventYear.addEventListener("change", renderEventFinder);
    els.eventFinderResults.addEventListener("click", (event) => {
      const card = event.target.closest("[data-event-name]");
      if (!card) return;
      renderEvent(card.dataset.eventName);
      requestAnimationFrame(() => els.eventDetail.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
    els.globalSearch.addEventListener("input", () => renderSearch(els.globalSearch.value.trim()));
    els.clearSearch.addEventListener("click", () => { els.globalSearch.value = ""; renderSearch(""); els.globalSearch.focus(); });
    els.searchResults.addEventListener("click", (event) => {
      const card = event.target.closest("[data-entity-id]");
      if (card) selectEntity(card.dataset.entityId);
    });
  }

  window.DebateInteractions = { setupInteractions };
}());
