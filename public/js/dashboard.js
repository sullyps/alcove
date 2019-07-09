// $('#dashboard-table').tablesort();

$.ajax({
  method: "GET",
  url: "/api/system/size",
  timeout: 15000
})
.done((data, statusText, xhr) => {
  $("#totalSize").text(xhr.responseJSON.dirSize);
  $("#freeSpace").text(xhr.responseJSON.freeSpace);
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
  console.error(errorMessage);
});
