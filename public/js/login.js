$("#login-form").on("submit", event => {
  event.preventDefault();
  $("#login-button button").attr("disabled", true);
  $("#login-loader").addClass("active");
  $.ajax({
    method: "POST",
    url: "/api/login",
    data: $("#login-form").serialize(),
    timeout: 15000
  })
  .done(() => {
    $("#login-error").attr("hidden", true);
    const url = new URL(window.location);
    window.location.href = url.searchParams.has("dest") ? url.searchParams.get("dest") : "/dashboard";
  })
  .fail((xhr, statusText) => {
    let errorMessage;
    switch (statusText)
    {
      case "abort":
        errorMessage = "The request was aborted";
        break;
      case "error":
        errorMessage = xhr.responseJSON.error;
        break;
      case "parsererror":
        errorMessage = "An error was encountered parsing the response";
        break;
      case "timeout":
        errorMessage = "The request timed out";
        break;
      default:
        errorMessage = "An unexpected error was encountered";
        break;
    }
    $("#login-error p").text(errorMessage);
    $("#login-error").removeAttr("hidden");
  })
  .always(() => {
    $("#login-button button").removeAttr("disabled");
    $("#login-loader").removeClass("active");
  });
});

$("input").on("keypress", () => {
  $("#login-error").attr("hidden", true);
});
