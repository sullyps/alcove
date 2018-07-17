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
    const url = new URL(window.location);
    window.location.href = url.searchParams.has("dest") ? url.searchParams.get("dest") : "/dashboard";
  })
  .fail((xhr, statusText) => {
    let errorMessage;
    if (xhr.responseJSON && xhr.responseJSON.error)
    {
      errorMessage = xhr.responseJSON.error;
    }
    else if (statusText === "timeout")
    {
      errorMessage = "The login request timed out. Please try again later...";
    }
    else
    {
      console.log("Internal error on login request: " + statusText);
      errorMessage = "An internal error has occurred. Please contact your system administrator for help...";
    }
    
    $("#login-error p").text(errorMessage);
    if ($('#login-error').hasClass('hidden'))
    {
      // If we are hidden, fade into view
      $("#login-error").transition("fade");
    }
    else
    {
      // Otherwise (if we are visible, or animating, or else), queue a shake
      $("#login-error").transition("shake");
    }
  })
  .always(() => {
    $("#login-button button").removeAttr("disabled");
    $("#login-loader").removeClass("active");
  });
});

/**
 * Add listener to ensure the error message isn't visible when it shouldn't be.
 */
$("input").on("keydown", () => {
  // Always hide if we are visible and a key is pressed on any input.
  // Don't queue this transition, in case we are animating
  if ($('#login-error').hasClass('visible') && !$('#login-error').hasClass('animating'))
  {
    $("#login-error").transition({ animation: "fade", queue: false });
  }
});
