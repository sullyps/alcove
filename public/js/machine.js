//$('#machine-table').tablesort();
function generateCalendar(calendar) {
  let eventDates = [];
  for (let i = 0; i < calendar.length; i++)
  {
    let className;
    if (calendar[i].bucket !== 'false')
    {
      if (calendar[i].backup !== '') className = 'positive machine-dashboard-link-non-selectable';
      else className = 'negative machine-dashboard-link-non-selectable';
      if (calendar[i].today === 'true') className += 'machine-dashboard-calendar-today-border';
    }
    else
    {
      className = 'machine-dashboard-non-selectable';
      if (calendar[i].today === 'true') className += 'machine-dashboard-calendar-today-border';
    }
    eventDates.push({date: new Date(calendar[i].date), class: className});
  }
  $('#inline-calendar')
    .calendar({
      eventDates: eventDates,
      disableMinute: true,
      type: 'date',
      selectAdjacentDays: true,
    });
}

/**
 * Makes an immediate backup of a machine given it's name.
 */
function makeImmediateBackup() {
  $('.backup-button').attr('disabled', 'disabled');

  const machineName = document.URL.split("/")[4];

  fetch(`/api/machine/${machineName}/trigger-backup`)
    .then(response => {
      response.json()
        .then(json => {
          console.log(json);
          setTimeout(() => location.reload(), 1000); // Wait 1 second before reloading to ensure new data exists on backend
        })
        .catch(console.err);
    })
    .catch(console.err);

  // TODO: Add a modal or other HTML feedback based on the backup status here? Refresh page?
  return;
}

$('.backup-button').on('click', makeImmediateBackup);
