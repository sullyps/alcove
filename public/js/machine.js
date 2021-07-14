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

