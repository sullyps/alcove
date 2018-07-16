$("#login-form").on("submit", event => {
  event.preventDefault();
  $.ajax({
    method: "POST",
    url: "/api/login",
    data: $("#login-form").serialize()
  })
  .done(() => {
    $("#login-error").attr("hidden", true);
    const url = new URL(window.location);
    window.location.href = url.searchParams.has("dest") ? url.searchParams.get("dest") : "/dashboard";
  })
  .fail(xhr => {
    $("#login-error p").text(xhr.responseJSON.error);
    console.log("Error " + xhr.status + ": " + xhr.responseJSON.error);
    $("#login-error").removeAttr("hidden");
  });
});

$("input").on("keypress", () => {
  $("#login-error").attr("hidden", true);
});
