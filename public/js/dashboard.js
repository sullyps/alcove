// $('#dashboard-table').tablesort();

$.ajax({
  method: "GET",
  url: "/api/system/size",
  timeout: 15000
})
.done((data, statusText, xhr) => {
  // Free space is just a string we can display
  $("#freeSpace").text(xhr.responseJSON.freeSpace);

  // Total size is an object so that we can create a popup that will indicate how accurate
  // the measurement is, and when it was last completed.
  // First just the string to display
  $("#totalSize").text(xhr.responseJSON.usedSpace.size);
 
  // Now create the popup
  $("#totalSizePopup").empty().append($("#sizePopupTemplate").html());
  $("#totalSizePopup .type").text(xhr.responseJSON.usedSpace.type);
  $("#totalSizePopup .time").text(xhr.responseJSON.usedSpace.time);

  // And finally tell the triggering element to popup on hover
  $("#totalSize").popup({ inline: true, position: "bottom center" });
})
.fail((xhr, statusText) => {
  let errorMessage;
  if (xhr.responseJSON && xhr.responseJSON.error)
  {
    errorMessage = xhr.responseJSON.error;
  }
  else if (statusText === "timeout")
  {
    errorMessage = "The backup system size request timed out.";
  }
  else
  {
    errorMessage = "Internal error on backup system size request: " + statusText;
  }
  $('.dir-size-segment').remove();
  $('#dashboard-header-segments')
  .removeClass('three column row')
  .addClass('two column row')
  .prepend(
    `<div class="column">` +
    `  <div class="ui red segment dashboard-header-segment">` +
    `    Error: <br><span class="bold">${errorMessage}</span>` +
    `  </div>` +
    `</div>`);
});
