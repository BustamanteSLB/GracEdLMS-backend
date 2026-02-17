const Holiday = require("../models/Holiday");
const Event = require("../models/Event");
const User = require("../models/User");
const cron = require("node-cron");

// Philippine holidays data
const philippineHolidays = [
  {
    name: "New Year's Day",
    month: 1,
    day: 1,
    type: "regular",
    description: "Regular Holiday",
  },
  {
    name: "EDSA People Power Anniversary",
    month: 2,
    day: 25,
    type: "special",
    description: "Special (Non-Working)",
  },
  {
    name: "Araw ng Kagitingan",
    month: 4,
    day: 9,
    type: "regular",
    description: "Regular Holiday",
  },
  {
    name: "Labor Day",
    month: 5,
    day: 1,
    type: "regular",
    description: "Regular Holiday",
  },
  {
    name: "Independence Day",
    month: 6,
    day: 12,
    type: "regular",
    description: "Regular Holiday",
  },
  {
    name: "Ninoy Aquino Day",
    month: 8,
    day: 21,
    type: "special",
    description: "Special (Non-Working)",
  },
  {
    name: "All Saints' Day",
    month: 11,
    day: 1,
    type: "special",
    description: "Special (Non-Working)",
  },
  {
    name: "Bonifacio Day",
    month: 11,
    day: 30,
    type: "regular",
    description: "Regular Holiday",
  },
  {
    name: "Feast of the Immaculate Conception",
    month: 12,
    day: 8,
    type: "special",
    description: "Special (Non-Working)",
  },
  {
    name: "Christmas Day",
    month: 12,
    day: 25,
    type: "regular",
    description: "Regular Holiday",
  },
  {
    name: "Rizal Day",
    month: 12,
    day: 30,
    type: "regular",
    description: "Regular Holiday",
  },
  {
    name: "New Year's Eve",
    month: 12,
    day: 31,
    type: "special",
    description: "Special (Non-Working)",
  },
];

// Helper function to get holiday body message
function getHolidayBodyMessage(holidayName) {
  const messages = {
    "New Year's Day":
      "Happy New Year! There are no classes today as we welcome a brand new year. May it be filled with blessings and joy for you and your family.",
    "EDSA People Power Anniversary":
      "In observance of the EDSA People Power Revolution Anniversary, there will be no classes today. Let us reflect on the value of peace, freedom, and unity. Classes will resume tomorrow.",
    "Araw ng Kagitingan":
      "Classes are suspended today in honor of Araw ng Kagitingan. Let us remember and give thanks to the bravery of our Filipino heroes. Classes will resume soon. Thank you.",
    "Labor Day":
      "Today we celebrate Labor Day. Classes are suspended in recognition of the hard work and dedication of all workers, including our beloved teachers and staff. Enjoy your day!",
    "Independence Day":
      "Classes are suspended today in celebration of Philippine Independence Day. Let us take this time to honor the freedom and history of our country. Mabuhay ang Pilipinas!",
    "Ninoy Aquino Day":
      "Classes are suspended today in observance of Ninoy Aquino Day. Let us remember his courage and contribution to our nation's democracy.",
    "All Saints' Day":
      "Our classes are suspended for today in observance of All Saints' Day. Please take this time to remember and pray for our dearly departed. Classes will resume tomorrow. Thank you.",
    "Bonifacio Day":
      "There are no classes today in celebration of Bonifacio Day. Let us remember the bravery of Gat Andres Bonifacio and his role in our country's fight for freedom. Enjoy your day and see you in class soon!",
    "Feast of the Immaculate Conception":
      "Today is the Feast of the Immaculate Conception of Mary. Classes are suspended to honor this important day in the Catholic faith. Thank you and God bless.",
    "Christmas Day":
      "Merry Christmas! There are no classes today as we celebrate the birth of our Savior, Jesus Christ. May your day be filled with love, joy, and peace.",
    "Rizal Day":
      "There are no classes today in honor of Dr. Jose Rizal, our national hero. May we be inspired by his love for our country and dedication to education.",
    "New Year's Eve":
      "As we prepare to welcome the new year, there are no classes today. Take this time to reflect, rest, and celebrate with your family. See you next year!",
  };

  return (
    messages[holidayName] ||
    "Classes are suspended today in observance of this holiday. Thank you."
  );
}

// Helper function to normalize date to midnight UTC (date only)
const normalizeDate = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

// Initialize holidays in database (runs once)
async function initializeHolidays() {
  try {
    const existingHolidays = await Holiday.countDocuments();

    if (existingHolidays === 0) {
      console.log("🎉 Initializing Philippine holidays...");
      await Holiday.insertMany(philippineHolidays);
      console.log("✅ Philippine holidays initialized successfully");
    } else {
      console.log("📅 Philippine holidays already exist in database");
    }
  } catch (error) {
    console.error("❌ Error initializing holidays:", error);
  }
}

// Generate holiday events for a specific year
async function generateHolidayEventsForYear(year) {
  try {
    console.log(`📅 Generating holiday events for ${year}...`);

    const holidays = await Holiday.find({ isActive: true });
    let adminUser = await User.findOne({ role: "Admin" });

    // If no admin user exists, create a system admin
    if (!adminUser) {
      console.log(
        "⚠️ No admin user found, creating system admin for holidays..."
      );
      adminUser = await User.create({
        userId: "SYSTEM_ADMIN",
        username: "system_admin",
        firstName: "System",
        lastName: "Administrator",
        email: "system@graced.edu.ph",
        password: "system_password_" + Date.now(),
        role: "Admin",
        sex: "Other",
        phoneNumber: "000-000-0000",
        address: "System Generated",
        status: "active",
      });
    }

    const createdEvents = [];

    for (const holiday of holidays) {
      // Create date at midnight UTC (all-day event)
      const eventDate = new Date(
        Date.UTC(year, holiday.month - 1, holiday.day, 0, 0, 0, 0)
      );

      // Check if event already exists for this year
      const existingEvent = await Event.findOne({
        title: holiday.name,
        startDate: eventDate,
        endDate: eventDate,
        eventType: "holiday",
      });

      if (!existingEvent) {
        const eventData = {
          createdBy: adminUser._id,
          title: holiday.name,
          header: "Class Suspended",
          body: getHolidayBodyMessage(holiday.name),
          startDate: eventDate,
          endDate: eventDate, // Same day event
          isAllDay: true, // NEW - Mark as all-day event
          priority: holiday.type === "regular" ? "high" : "medium",
          targetAudience: "all",
          eventType: "holiday",
          images: [],
        };

        const event = await Event.create(eventData);
        createdEvents.push(event);
      }
    }

    console.log(
      `✅ Created ${createdEvents.length} holiday events for ${year}`
    );
    return createdEvents;
  } catch (error) {
    console.error(`❌ Error generating holiday events for ${year}:`, error);
    return [];
  }
}

// Generate holidays for current year and next 2 years
async function generateMultipleYears() {
  const currentYear = new Date().getFullYear();

  for (let i = 0; i < 3; i++) {
    const year = currentYear + i;
    await generateHolidayEventsForYear(year);
  }
}

// Schedule automatic holiday generation
function scheduleHolidayGeneration() {
  // Run every January 1st at 00:01 AM to generate holidays for the new year
  cron.schedule("1 0 1 1 *", async () => {
    console.log("🔄 Running annual holiday generation...");
    const currentYear = new Date().getFullYear();

    // Generate for current year and next 2 years
    await generateHolidayEventsForYear(currentYear);
    await generateHolidayEventsForYear(currentYear + 1);
    await generateHolidayEventsForYear(currentYear + 2);

    console.log("✅ Annual holiday generation completed");
  });

  // Also run every month on the 1st to ensure we don't miss anything
  cron.schedule("0 2 1 * *", async () => {
    console.log("🔄 Running monthly holiday check...");
    const currentYear = new Date().getFullYear();

    // Check and generate for current and next year
    await generateHolidayEventsForYear(currentYear);
    await generateHolidayEventsForYear(currentYear + 1);

    console.log("✅ Monthly holiday check completed");
  });
}

// Initialize everything on server start
async function initializeHolidaySystem() {
  try {
    console.log("🚀 Initializing holiday system...");

    // Initialize holidays in database
    await initializeHolidays();

    // Generate events for current year and next 2 years
    await generateMultipleYears();

    // Start the scheduler
    scheduleHolidayGeneration();

    console.log("✅ Holiday system initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing holiday system:", error);
  }
}

module.exports = {
  initializeHolidaySystem,
  generateHolidayEventsForYear,
  initializeHolidays,
};
