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
    errorMessage = "Internal error on backup system size request" + statusText;
  }
  // TODO:  handle this in the UI
  console.error(errorMessage);
});
