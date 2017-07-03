/** This script identifies the number of conflicts per hour per day. It doesn't
    display if an hour exists but has 0 meetings, so you'll have to take note of
    those yourself.
*/
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
  var hoursUsed = {};
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
          var summary = (event.summary ? event.summary.toLowerCase() : '');
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
          if (customization.debug) {
            console.log("found " + event['summary'] + " on " + modifiedStart.toString());
            console.log("date: " + modifiedStart.getDate() + " and hour: " + modifiedStart.getHours());
          }

          var dayOfMonth = modifiedStart.toDateString();
          if (dayOfMonth == "Invalid Date") {
            continue;
          }
          var startHour = modifiedStart.getHours();
          var endHour = modifiedEnd.getHours(); 
          if (!hoursUsed[dayOfMonth]) {
            hoursUsed[dayOfMonth] = {};
          }
          if (!hoursUsed[dayOfMonth][startHour]) {
            hoursUsed[dayOfMonth][startHour] = 0;
          }
          hoursUsed[dayOfMonth][startHour]++;
          if (endHour > startHour) {
            for(var midHour = endHour; midHour > startHour; midHour--) {
              if (!hoursUsed[dayOfMonth][midHour]) {
                hoursUsed[dayOfMonth][midHour] = 0;
              }
              hoursUsed[dayOfMonth][midHour]++;
            }
          }
 
          continue; // Move on to the next event.
        }
      }
      if (numToProcess-- <= 1) {
        var days = Object.keys(hoursUsed);
        days.sort();
        days.forEach(function(day) {
          console.log("Day: " + day);
          var hoursInDay = Object.keys(hoursUsed[day]);
          hoursInDay.sort(function(a,b) { return a-b; });
          hoursInDay.forEach(function(hour) {
            console.log(" - " + hour + " : " + hoursUsed[day][hour]);
          });
        });
        if (customization.debug) {
          console.log(JSON.stringify(hoursUsed)); 
        }
      }
    }.bind({calendarId:calendarId, calendarIndex:calendarIndex, numToProcess:numToProcess, numberOfCalendars:numberOfCalendars, argv:argv}));
  }
}
