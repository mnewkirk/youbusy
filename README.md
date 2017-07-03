# You Busy?

The youbusy script scrapes Google Calendar for confirmed (RSVP Yes) events for a set of calendars, and for a given range of dates. This solved a manual problem of trying to figure out how much availability engineers had for each sprint.

## Installation

Install dependencies:

	make depends

## Usage

	node youbusy.js <one or more e-mail addresses separated by space> [--timeMin=YYYY-MM-DD] [--timeMax=YYYY-MM-DD]
	node besttime.js <same parameters as above>

Or more precise:

	node youbusy.js <one or more e-mail addresses separated by space> [--timeMin=<year-month-dateThour:minute:second-timezone_offset] [--timeMax=<year-month-dateThour:minute:second-timezone_offset] [--debug] [--ignorescrum=0|1]

### Google Calendar API Key

You'll need a client_secret.json. Follow the steps from [this quickstart guide](https://developers.google.com/google-apps/calendar/quickstart/nodejs) to turn on the Google Calendar API and save the client id json file to your youbusy directory.

The first time this runs, you'll also need to authorize your client id which will save calendar-nodejs-quickstart.json to your ~/.credentials folder.
### customize.json
There is a provided customize.json in examples/ -- feel free to edit the list of ignorable events as well as the start and end times of the workday. Note that these times apply as viewed by the owner of the auth token, so if you are in San Francisco, Brooklynites may have earlier morning meetings.

## Output for youbusy
It outputs each person's meeting time followed by some sums and then the total amount of available time in that date range.

### Sample output (comments in-line):
	// This looks up the calendars for Alice, Bob, and Carla, from December 13 2016 to December 26 2016.
	node youbusy.js alice@example.com bob@example.com carla@example.com --timeMin=2016-12-13T13:00:00-07:00 --timeMax=2016-12-26T17:00:00-07:00
	
	// This tells us how many hours of meetings each person has
	Total for alice@example.com: 715m == 11.916666666666666h
	Total for bob@example.com: 1130m == 18.833333333333332h
	Total for carla@example.com: 1075m == 17.916666666666668h

	// Our total number of meetings for the group
	Total hours of meetings: 2920m == 48.666666666666664h

	// This tells us how big the maximum number of hours is based on the startTime and endTime in customize.json, with 1 hour for lunch
	There are 8 x 3 people = 240h between 2016-12-13T20:00:00.000Z and 2016-12-27T00:00:00.000Z.

	// For the amount of time in this range, this is how many hours are free
	Total available: 191.33333333333334h

	// And if we apply a 75% availability ratio, here's what we have left
	Total available at 75%: 143.5h

## Output for besttime
This script outputs each work hour for each work day between the timeMin and timeMax specified with counts of the number of conflicts.

### Sample output (comments in-line):
  // This looks up the calendars for 40 people between July 5 and July 6.
  node besttime <emails of 40 people> --timeMin=2017-07-05T08:00:00-07 --timeMax=2017-07-06T18:00:00-07

	// We can see here that the best hours are 15 and 16. Cool. Assuming that some of these people are in a different timezone and you need your meeting to end before 14, the clear winner here is 9am on July 6th with only 10 conflicts. As a note, this script really doesn't handle timezones super well and assumes that all meeting events are in *your* timezone.
	Day: Wed Jul 05 2017
	 - 9 : 19
	 - 10 : 24
	 - 11 : 28
	 - 12 : 31
	 - 13 : 28
	 - 14 : 15
	 - 15 : 6
	 - 16 : 1
	Day: Wed Jul 06 2017
	 - 9 : 10
	 - 10 : 19
	 - 11 : 28
	 - 12 : 20
	 - 13 : 19
	 - 14 : 8
	 - 15 : 5
	 - 16 : 1
	 - 17 : 1
  
