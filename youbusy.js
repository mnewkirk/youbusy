var Helper = require('./lib/helper');
var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var argv = require('minimist')(process.argv.slice(2));
var moment = require('moment');
var customization = {};

var youbusyHelper = new Helper();
customization = youbusyHelper.defaultCustomization();

// Load client secrets from a local file.
fs.readFile('client_secret.json', function processClientSecrets(err, secretContent) {
  if (err) {
    console.log('Error loading client secret file: ' + err);
    return;
  }
  fs.readFile('customize.json', function processCustomizations(err, CustomizeContent) {
	  if (err) {
    	return;
	  }
	  customization = JSON.parse(CustomizeContent);
	  // Authorize a client with the loaded credentials, then call the
	  // Google Calendar API.
	  youbusyHelper.authorize(JSON.parse(secretContent), listEvents);
	});
});

/**
 * Go through all of the events for each calendar between two timestamps. Determine how
 * much of that time is scheduled (accepted meetings) and how much remains.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listEvents(auth) {
  var calendar = google.calendar('v3');
  var calendarOptions = youbusyHelper.deriveCalendarOptions(argv, customization);
  customization['debug'] = argv['debug'];
  var dailyDurations = {};
  var numToProcess = calendarOptions.calendarIds.length;
  var numberOfCalendars = numToProcess;
  var numberOfWorkHours = youbusyHelper.deriveHoursBetweenWorkdays(calendarOptions.timeMin, calendarOptions.timeMax, customization); 
  var numberOfWorkHoursPerDay = moment().hours(customization.workday.endTime).diff(moment().hours(customization.workday.startTime), 'hours');
  for (var calendarIndex = 0; calendarIndex < calendarOptions.calendarIds.length; calendarIndex++) {
    var calendarId = calendarOptions.calendarIds[calendarIndex];
    calendar.events.list({
      auth: auth,
      calendarId: calendarId,
      timeMin: calendarOptions.timeMin,
      timeMax: calendarOptions.timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    }, function(err, response) {
      if (err) {
        console.log('The API returned an error: ' + err);
        return;
      }
      var events = response.items;
      if (events.length == 0) {
        console.log('No upcoming events found for ' + this.calendarId + '.');
      } else {
        var filteredEvents = events.filter(function(event) {
          if (event.start.dateTime) {
            var startDateTime = new Date(event.start.dateTime);
            if (startDateTime.getHours() < customization.workday.startTime ||
              startDateTime.getHours() >= customization.workday.endTime ||
              startDateTime.getDay() < customization.workday.startDay ||
              startDateTime.getDay() > customization.workday.endDay) return 0;
          }
          var summary = event.summary.toLowerCase();
          if (youbusyHelper.isIgnoredSummary(summary, customization.ignored)) {
            return 0;
          }
         if (!event['attendees']) return 1;
         var rsvpYes = 0;
         for(var attendeeIndex = 0; attendeeIndex < event['attendees'].length; attendeeIndex++) {
           var attendee = event['attendees'][attendeeIndex];
           if (attendee['email'] == this.attendeeName && attendee['responseStatus'] == 'accepted') {
             rsvpYes = 1;
             break;
           }
         }
         return rsvpYes;
        }.bind({attendeeName:this.calendarId}));
        for (var i = 0; i < filteredEvents.length; i++) {
          var event = filteredEvents[i];
          var modifiedStart = new Date(event.start.dateTime);
          var modifiedEnd = new Date(event.end.dateTime);
          if (modifiedEnd.getHours() >= customization.workday.endTime) {
            modifiedEnd.setHours(customization.workday.endTime);
            modifiedEnd.setMinutes(0);
          }
          if (modifiedStart.getHours() < customization.workday.startTime) {
            modifiedStart.setHours(customization.workday.startTime);
            modifiedStart.setMinutes(0);
          }
          var duration = modifiedEnd - modifiedStart;
          // Duration starts in milliseconds. Let's reduce to minutes.
          duration = duration / 60000;
          if (!duration) {
            var startThreshold = moment(argv['timeMin']);
            var modifiedStartMoment = moment(event.start.date);
            if (startThreshold.isBefore(modifiedStartMoment)) {
              startThreshold = modifiedStartMoment;
            }
            var endThreshold = moment(argv['timeMax']);
            var modifiedEndMoment = moment(event.end.date);
            if (endThreshold.isAfter(modifiedEndMoment)) {
              endThreshold = modifiedEndMoment;
            }
            for (var dayToProcess = startThreshold; dayToProcess.isBefore(endThreshold); dayToProcess.add(1, 'days')) {
              var dayOfWeek = dayToProcess.toDate().getDay();
              if (dayOfWeek < customization.workday.startDay ||
                dayOfWeek > customization.workday.endDay) {
                continue; // Skip the weekend
              }
              var dayOfMonth = dayToProcess.toDate().getDate();
              if (!dailyDurations[this.calendarId]) {
                dailyDurations[this.calendarId] = {};
              }
              if (!dailyDurations[this.calendarId][dayOfMonth]) {
                dailyDurations[this.calendarId][dayOfMonth] = 0;
              }
              // For each all-day event, add numberOfWorkHoursPerDay hours.
              dailyDurations[this.calendarId][dayOfMonth] = dailyDurations[this.calendarId][dayOfMonth] + numberOfWorkHoursPerDay*60;
              if (customization.debug) {
                console.log(this.calendarId + ' - Adding ' + numberOfWorkHoursPerDay + 'h to ' + event['summary'] + ' for ' + dayOfMonth);
              }
            }
            continue; // Move on to the next event.
          }
          var startDay = new Date(event.start.dateTime).getDate();
          if (!startDay) {
            startDay = new Date(event.start.date).getDate();
          }
          if (!dailyDurations[this.calendarId]) {
            dailyDurations[this.calendarId] = {};
          }
          if (!dailyDurations[this.calendarId][startDay]) {
            dailyDurations[this.calendarId][startDay] = 0;
          }
          dailyDurations[this.calendarId][startDay] = dailyDurations[this.calendarId][startDay] + duration;
          if (customization.debug) {
            console.log(this.calendarId + ' - Adding ' + duration + ' to ' + event['summary'] + ' for ' + startDay);
          }
        }
      }
      if (numToProcess-- <= 1) {
        var totalNumberOfWorkHours = numberOfWorkHoursPerDay * numberOfCalendars;

        var total = 0;
        var totals = {};
        Object.keys(dailyDurations).forEach(function(calendarId) {
          var perPersonTotal = 0;
          Object.keys(dailyDurations[calendarId]).forEach(function(day) {
            if (!totals[day]) {
              totals[day] = 0;
            }
            var amountBeingAdded = Math.min(dailyDurations[calendarId][day], numberOfWorkHoursPerDay*60);
            totals[day] = totals[day] + amountBeingAdded;
            perPersonTotal = perPersonTotal + amountBeingAdded;
            if (customization.debug) {
              console.log('added ' + amountBeingAdded + ' for ' + calendarId + ' / ' + day);
            }
          });
          console.log('Total for ' + calendarId + ': ' + perPersonTotal + 'm == ' + (perPersonTotal/60) + 'h');
        });
        Object.keys(totals).forEach(function(day) {
          if (customization.debug) {
            console.log('%d - %dm = %dh', day, totals[day], totals[day] / 60);
          }
          total = total + totals[day];
        });
        var totalHours = total/60;
        var totalNumberOfWorkHours = numberOfWorkHours * numberOfCalendars;
        console.log("\nTotal hours of meetings: " + total + "m == " + totalHours + "h");
        var totalAvailable = (totalNumberOfWorkHours - totalHours);
        // TODO: Note, this number of hours displays the number of FULL days, but doesn't include partial days. It should
        // be refactored to accurately show the number of hours between start day/start hour and end day/end hour
        console.log("\nThere are " + numberOfWorkHours + " work hours x " + numberOfCalendars + " people = " + 
          totalNumberOfWorkHours + "h between " + moment(calendarOptions.timeMin).toString() +
           " and " + moment(calendarOptions.timeMax).toString() + ".");

        console.log("\nTotal available: " + totalAvailable + "h");
        console.log("\nTotal available at 75%: " + totalAvailable * 75 / 100  + "h");
      }
    }.bind({calendarId:calendarId, calendarIndex:calendarIndex, numToProcess:numToProcess, numberOfCalendars:numberOfCalendars, argv:argv}));
  }
}
