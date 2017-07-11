/** This file contains all calendar/event related helper functions **/
var moment = require('moment');
var business = require('moment-business');
// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/calendar-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'calendar-nodejs-quickstart.json';
var fs = require('fs');
var readline = require('readline');
var googleAuth = require('google-auth-library');

'use strict';

function Helper() {
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
Helper.prototype.authorize = function (credentials, callback, customization) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function(err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      var callbackResults = callback(oauth2Client, customization);
    }
  });
};

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', function(code) {
    rl.close();
    oauth2Client.getToken(code, function(err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
};
/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + TOKEN_PATH);
};

/**
 * Set up a customization object with our defaults. These can be overridden
 * by customize.json
 */
Helper.prototype.defaultCustomization = function() {
  var defaultCustomization = {}
  defaultCustomization['ignored'] = [];
  defaultCustomization['scrumKeywords'] = [];
  defaultCustomization['workday'] = {
    'startDay' : 1,
    'endDay' : 5,
    'startTime' : 9,
    'endTime' : 17
  };
  defaultCustomization['debug'] = 0;
  defaultCustomization['ignorescrum'] = 0;
  return defaultCustomization;
};
/**
 * Generate a list of calendars to retrieve results for.
 */
Helper.prototype.deriveCalendarOptions = function(arguments, customization) {
  var options = [];
  var FOURTEEN_DAYS = 12096e5;
  var timeFormat = 'YYYY-MM-DDTHH:mm:ssZZ';
  var defaultTimeMin = new Date(+new Date - FOURTEEN_DAYS).toISOString();
  if (!customization) {
    customization = {};
  }
  options['timeMax'] = arguments['timeMax'] ? moment(arguments['timeMax']).format(timeFormat) : (new Date()).format(timeFormat);
  options['timeMin'] = arguments['timeMin'] ? moment(arguments['timeMin']).format(timeFormat) : defaultTimeMin;
  options['ignorescrum'] = arguments['ignorescrum'];
  if (options.ignorescrum && customization.ignored) {
    customization.scrumKeywords.forEach(function(keyword) {
    customization.ignored.push(keyword);
    });
  }
  var calendars = customization['emails'] || [];
  for (var argIndex = 0; argIndex < arguments['_'].length; argIndex++) {
    calendars.push(arguments['_'][argIndex]);
  }
  if (calendars.length < 1) {
    calendars.push("primary");
  }
  options['calendarIds'] = calendars;
  return options;
}
function deriveWorkHours(startTime, endTime) {
  var endHour = moment('2017-01-01').hour(endTime).minutes(0).seconds(0);
  var startHour = moment('2017-01-01').hour(startTime).minutes(0).seconds(0);
  return endHour.diff(startHour, 'hours');
}
/**
 * How many workdays are between two dates? We determine our workdays from customization.js
 * and assume a calendar with 7 week days (though we don't assume 5 work days per week).
 */
Helper.prototype.deriveHoursBetweenWorkdays = function(startDay, endDay, customization) {
  var midDays = business.weekDays(moment(startDay).add(1, 'days'), moment(endDay).subtract(1, 'days'));
  var midHours = midDays * deriveWorkHours(customization.workday.startTime, customization.workday.endTime);
  var startHours = deriveWorkHours(moment(startDay).hour(), customization.workday.endTime);
  var endHours = deriveWorkHours(customization.workday.startTime, moment(endDay).hour());
  if (customization.debug) {
    console.log('midDays: ' + midDays + ' midHours: ' + midHours + ' startHours: ' + startHours + ' endHours: ' + endHours);
  }
  return midHours + startHours + endHours;
}

/**
 * Should we skip over this event? Some events don't indicate activity, like "WFH".
 */
Helper.prototype.isIgnoredSummary = function(summary, ignored) {
  if (!summary || !ignored) return 0;
  var ignoredLength = ignored.length;
  for (var ignoredIndex = 0; ignoredIndex < ignoredLength; ignoredIndex++) {
    if (summary.indexOf(ignored[ignoredIndex]) > -1) {
      return 1;
    }
  }
  return 0;
}

module.exports = Helper;
