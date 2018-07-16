$("#login-frame").on("submit", event => {
  event.preventDefault();
  $.ajax({
    method: "POST",
    url: "/api/login",
    data: $("#login-frame").serialize()
  })
  .done((data, statusText, xhr) => {
    console.log(xhr.status);
    $("#login-error").attr("hidden", true);
  })
  .fail(xhr => {
    $("#login-error p").text("Error " + xhr.status + ": " + xhr.responseJSON.error);
    $("#login-error").removeAttr("hidden");
  });
});
