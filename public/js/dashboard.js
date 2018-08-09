$.ajax({
  method: "GET",
  url: "/api/dashboard/size",
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
    errorMessage = "The dashboard size request timed out.";
  }
  else
  {
    errorMessage = "Internal error on dashboard size request" + statusText;
  }
  console.error(errorMessage);
});
