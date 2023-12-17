const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const { engine } = require("express-handlebars");
const HTTP_PORT = process.env.PORT || 8080;
const session = require("express-session");
const handlebarsHelpers = require("handlebars-helpers");
const multihelpers = handlebarsHelpers();
const multer = require("multer");
const uploadDest = "./public/images";

// import the satatic files
app.use(express.static(path.join(__dirname, "public")));

// receive data from a <form>
app.use(express.urlencoded({ extended: true }));

// import handlebars
app.engine(
  ".hbs",
  engine({
    extname: ".hbs",
    helpers: multihelpers,
    runtimeOptions: {
      allowProtoPropertiesByDefault: true,
      allowProtoMethodsByDefault: true,
    },
  })
);
app.set("views", "./views");
app.set("view engine", ".hbs");

//configure the express session
app.use(
  session({
    secret: "MDAS4012",
    resave: false,
    saveUninitialized: true,
  })
);

// Set up multer storage
const storage = multer.diskStorage({
  destination: "./public/images",
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// Initialize multer with the storage configuration
const upload = multer({ storage: storage });

/// --------------
//     DATABASE
/// --------------
// Replace this connection string with yours
const CONNECTION_STRING =
  "mongodb+srv://gbct440:WtGi0IOlE0qWr3Jl@cluster0.a0yugip.mongodb.net/MADS4012?retryWrites=true&w=majority";

mongoose.connect(CONNECTION_STRING, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;

db.on("error", console.error.bind(console, "Error connecting to database: "));
db.once("open", () => {
  console.log("Mongo DB connected successfully.");
});
// schemas
const orderSchema = new mongoose.Schema({
  customerName: {
    type: String,
    required: true,
  },
  deliveryAddress: {
    type: String,
    required: true,
  },
  itemsOrdered: [
    {
      name: String,
      quantity: Number,
      price: Number,
    },
  ],
  dateTime: {
    type: Date,
    default: Date.now,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  orderConfirmationNumber: {
    type: String,
    required: true,
  },
  isAssigned: Boolean,
  status: {
    type: String,
    enum: ["RECEIVED", "READY FOR DELIVERY", "IN TRANSIT", "DELIVERED"],
    default: "RECEIVED",
  },
  deliveryPhoto: String,
  selectedByDriver: {
    type: String,
    default: "n/a",
  },
  driverLicensePlate: {
    type: String,
    default: "n/a",
  },
  deliveryDate: Date,
  deliveryTime: String,
});

const driverSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  vehicleModel: { type: String, required: true },
  color: { type: String, required: true },
  licensePlate: { type: String, required: true },
});

const menuitemSchema = new mongoose.Schema({
  name: String,
  image: String,
  description: String,
  price: Number,
});

const Order = mongoose.model("orders_collection", orderSchema);
const Driver = mongoose.model("drivers_collection", driverSchema);
const MenuItem = mongoose.model("menuitems_collection", menuitemSchema);

//Middleware to check if user is logged in
const ensureLogin = (req, res, next) => {
  try {
    if (req.session.isLoggedIn !== undefined && req.session.isLoggedIn) {
      next();
    } else {
      return res.render("login", {
        errorMsg: "You must log in first to access the dashboard",
        layout: "login-register",
      });
    }
  } catch (error) {
    console.error("Error in ensureLogin middleware:", error);
    res.status(500).send("Internal Server Error");
  }
};

// for orders website update function
const statusEnum = {
  received: "RECEIVED",
  readyForDelivery: "READY FOR DELIVERY",
  delivered: "DELIVERED"
};

// ----------------
// endpoints: Restaurant Website
// ----------------
// Sample restaurant data
const rest = {
  name: "Chou's Garden Restaurant",
  banner:
    "https://static.wixstatic.com/media/dce932_a39073d8085544d0ab525c534fbfb7c5.jpg/v1/fill/w_1013,h_595,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/dce932_a39073d8085544d0ab525c534fbfb7c5.jpg",
  location: "123 Main St, City",
  hours: "Mon-Fri: 9 AM - 10 PM, Sat-Sun: 10 AM - 11 PM",
};

// Define routes
app.get("/home", (req, res) => {
  return res.render("home", { layout: "main", restaurantInfo: rest });
});

app.get("/menus", async (req, res) => {
  try {
    // gets all Course documents
    const results = await MenuItem.find().lean().exec();
    console.log(results);

    // error handling
    if (results.length === 0) {
      return res.send("ERROR: No items in database");
    }

    return res.render("menu", { layout: "main", menuItems: results });
  } catch (err) {
    console.log(err);
  }
});

app.get("/cart", (req, res) => {
  // Retrieve the cart items from the user's session
  const cartItems = req.session.cart || [];
  // Calculate the total price of items in the cart
  const totalPrice = cartItems.reduce((total, item) => total + item.price, 0);

  return res.render("cart", { layout: "main", cartItems, totalPrice });
});

app.post("/addToCart", async (req, res) => {
  const { menuItemId } = req.body;

  try {
    // Check if the menu item exists in the database
    const menuItem = await MenuItem.findById(menuItemId);

    if (!menuItem) {
      return res.status(404).send("Menu item not found.");
    }

    // Initialize the cart in the session if it doesn't exist
    if (!req.session.cart) {
      req.session.cart = [];
    }

    // Add the selected menu item to the cart
    req.session.cart.push({
      id: menuItem._id,
      name: menuItem.name,
      price: menuItem.price,
    });
    console.log("Name", menuItem.name);
    // Redirect to the cart page or a confirmation page
    res.redirect("/cart");
  } catch (err) {
    console.error("Error placing an order", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/emptyCart", (req, res) => {
  // Clear the user's shopping cart in the session
  req.session.cart = [];

  // Redirect back to the cart page or a confirmation page
  res.redirect("/cart");
});

app.post("/removeFromCart", (req, res) => {
  const { cartItemId } = req.body;

  // Retrieve the user's shopping cart from the session
  const cart = req.session.cart || [];

  // Find the index of the item to remove based on its ID
  const itemIndex = cart.findIndex((item) => item.id === cartItemId);
  console.log(itemIndex);
  if (itemIndex != -1) {
    // Remove the item from the cart array
    cart.splice(itemIndex, -1);
  }

  // Update the session cart with the modified cart
  req.session.cart = cart;

  // Redirect back to the cart page or a confirmation page
  res.redirect("/cart");
});

app.get("/checkout", (req, res) => {
  // Retrieve the cart items from the user's session
  const cartItems = req.session.cart || [];

  // Calculate the total price of items in the cart
  const totalPrice = cartItems.reduce((total, item) => total + item.price, 0);

  return res.render("checkout", { layout: "main", cartItems, totalPrice });
});

app.post("/processOrder", async (req, res) => {
  try {
    // Retrieve customer details and payment information from the request body
    const { name, address } = req.body;

    // Retrieve the cart items from the user's session
    const cartItems = req.session.cart || [];

    // Calculate the total price of items in the cart
    const totalPrice = cartItems.reduce((total, item) => total + item.price, 0);

    // Generate a unique confirmation number (customize as needed)
    function generateConfirmationNumber(length) {
      const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const charactersLength = characters.length;
      let confirmationNumber = "";

      for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charactersLength);
        confirmationNumber += characters.charAt(randomIndex);
      }

      return confirmationNumber;
    }
    const confirmationNumber = generateConfirmationNumber(9);

    // Create a new order document in the database
    const order = new Order({
      itemsOrdered: cartItems,
      customerName: name,
      deliveryAddress: address,
      totalAmount: totalPrice,
      status: "RECEIVED", // You can set the initial status as 'Pending'
      orderConfirmationNumber: confirmationNumber,
    });

    await order.save();

    console.log("Order Details:");
    console.log("Customer Name:", name);
    console.log("Customer Address:", address);
    console.log("Total Price:", totalPrice);
    console.log("Cart Items:", cartItems);
    console.log("Order Confirmation Number:", confirmationNumber);

    
    req.session.cart = [];

    // Redirect to a thank you or confirmation page
    return res.render("order-confirmation", {
      layout: "main",
      name,
      confirmationNumber,
      cartItems,
      totalPrice,
    });
  } catch (err) {
    console.error("Error processing the order", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/checkOrderStatus", (req, res) => {
  res.render("order-status", { layout: "main" });
});

app.post("/checkOrderStatus", async (req, res) => {
  const numFromUI = req.body.orderCoNum;
  console.log(`DEBUG: Searching for ${numFromUI}`);

  try {
    // search for instructor by firstname name
    const results = await Order.find({ orderConfirmationNumber: numFromUI })
      .lean()
      .exec();
    return res.render("order-status", {
      layout: "main",
      confirmationNumber: results,
    });
  } catch (err) {
    console.error("Error checking order status", err);
    res.status(500).send("Internal Server Error");
  }
});
// ----------------
// endpoints: Order Website
// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
app.get("/", async (req, res) => {
  res.render("index", { layout: "omain" });
});

app.get("/orders", async (req, res) => {
  try{
  const result = await Order.find({ status: { $ne: statusEnum.delivered } })
    .sort({ dateTime: -1 })
    .lean()
    .exec();
  const isEmpty = result.length === 0;

  res.render("orders-list", {
    layout: "omain",
    orders: result,
    isEmpty: isEmpty,
  });
}catch(err){
  res.send(err);
}
});

app.get("/orders-history", async (req, res) => {
  try{
  const orders = await Order.find({ status: { $ne: statusEnum.received } })
    .sort({ dateTime: -1 })
    .lean()
    .exec();
  res.render("orders-history", { layout: "omain", orders: orders });
} catch (err) {
  res.send(err);
}
});

app.post("/orders", async (req, res) => {
  const customerName = req.body.custName.toLowerCase();
  try{
  const output = await Order.find({
    customerName: customerName,
    status: { $ne: statusEnum.delivered },
  })
    .collation({ locale: "en", strength: 2 })
    .sort({ dateTime: -1 })
    .lean()
    .exec();
  const isEmpty = output.length === 0;
  res.render("orders-list", {
    layout: "omain",
    orders: output,
    isEmpty: isEmpty,
  });
} catch (err) {
  res.send(err);
}
});

app.get("/orders-history", async (req, res) => {
  try{
  const output = await Order.find({}).sort({ dateTime: -1 }).lean().exec();
  const isEmpty = output.length === 0;
  res.render("orders-history", {
    layout: "omain",
    orders: output,
    isEmpty: isEmpty,
  });
} catch (err) {
  res.send(err);
}
});

app.post("/orders/assign", async (req, res) => {
  const custId = req.body.updateBtn;
  const updateData = {
    status: statusEnum.readyForDelivery,
    isAssigned: true,
  };
  try{
  const result = await Order.updateOne({ _id: custId }, updateData);
  res.redirect("/orders");
} catch (err) {
  res.send(err);
}
});
// ----------------
// endpoints: Delivery Website
// -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
// GET request for the home page
app.get("/delivery", (req, res) => {
  res.render("login", { layout: "login-register" });
});

//GET request for the register page
app.get("/register", (req, res) => {
  res.render("register", { layout: "login-register" });
});

// GET request for the logout button
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/delivery");
});

// GET request for the dashboard page
app.get("/dashboard", ensureLogin, async (req, res) => {
  try {
    const driver = await Driver.findOne(
      { username: req.session.username },
      { fullName: 1 }
    ).lean();

    if (!driver || !driver.fullName) {
      console.error("Driver not found or does not have fullName attribute.");
      return res.status(404).send("Driver not found");
    }

    const availableOrders = await Order.find({ status: "READY FOR DELIVERY" });

    const pendingOrders = await Order.find({
      selectedByDriver: req.session.username,
      status: "IN TRANSIT",
    });

    const completedOrders = await Order.find({
      selectedByDriver: req.session.username,
      status: "DELIVERED",
    });

    res.render("dashboard", {
      layout: "dmain",
      driver: driver,
      availableOrders: availableOrders,
      pendingOrders: pendingOrders,
      completedOrders: completedOrders,
    });
  } catch (error) {
    console.error("Error fetching data for the dashboard:", error);
    res.status(500).send("Internal Server Error");
  }
});

// GET request for the list-of-orders page
app.get("/list-of-orders", ensureLogin, async (req, res) => {
  try {
    const readyForDeliveryOrders = await Order.find({
      status: "READY FOR DELIVERY",
    }).lean();
    res.render("list-of-orders", {
      layout: "dmain",
      orders: readyForDeliveryOrders,
    });
  } catch (error) {
    console.error("Error fetching orders for delivery:", error);
    res.status(500).send("Internal Server Error");
  }
});

// GET request for the delivery fulfillment page
app.get("/delivery-fulfillment-page", ensureLogin, async (req, res) => {
  try {
    // Retrieve the order details for orders with the status "IN TRANSIT" and assigned to the current driver
    const ordersInTransit = await Order.find({
      status: "IN TRANSIT",
      selectedByDriver: req.session.username,
    }).lean();
    // Render the delivery fulfillment page template with the order details
    res.render("delivery-fulfillment-page.hbs", {
      layout: "dmain",
      orders: ordersInTransit,
    });
  } catch (error) {
    // Handle errors during the retrieval process
    console.error("Error fetching order details:", error);
    res.status(500).send("Internal Server Error");
  }
});

// GET request for the delivery history page
app.get("/delivery-history", ensureLogin, async (req, res) => {
  try {
    // Retrieve orders with status "DELIVERED" and selected by the current driver
    const deliveredOrders = await Order.find({
      status: "DELIVERED",
      selectedByDriver: req.session.username,
    }).sort({ dateTime: -1 }).lean();

    res.render("delivery-history", {
      layout: "dmain",
      orders: deliveredOrders,
    });
  } catch (error) {
    console.error("Error fetching delivery history:", error);
    res.status(500).send("Internal Server Error");
  }
});

// GET request for displaying the delivery photo
app.get("/delivery-history/photo/:photoFilename", ensureLogin, (req, res) => {
  const photoFilename = req.params.photoFilename;
  const photoPath = path.join(__dirname, "public", "images", photoFilename);

  // Send the image file
  res.sendFile(photoPath);
});

app.get("/driver-profile", ensureLogin, async (req, res) => {
  try {
    const driver = await Driver.findOne({ username: req.session.username });
    // Render the driver profile template with the retrieved data
    res.render("driver-profile", {
      layout: "dmain",
      driver: driver,
    });
  } catch (error) {
    console.error("Error fetching driver data for the profile:", error);
    res.status(500).send("Internal Server Error");
  }
});

/// --------------
//     POST
/// --------------
// handle the register post request
app.post("/register", async (req, res) => {
  try {
    // Validate username
    const username = req.body.username;
    if (username.length < 4) {
      const errorMsg = "Username must be at least 4 characters long.";
      return res.render("register", { errorMsg, layout: "login-register" });
    }

    // Check if the username already exists in the database
    const existingUser = await Driver.findOne({ username });
    if (existingUser) {
      const errorMsg = "Username is already taken. Please choose another one.";
      return res.render("register", { errorMsg, layout: "login-register" });
    }

    // Validate password
    const password = req.body.password;
    if (password.length < 6) {
      const errorMsg = "Password must be at least 6 characters long.";
      return res.render("register", { errorMsg, layout: "login-register" });
    }

    const newDriver = await Driver.create({
      username,
      password,
      fullName: req.body.fullName,
      vehicleModel: req.body.vehicleModel,
      color: req.body.color,
      licensePlate: req.body.licensePlate,
    });

    console.log("New driver created:", newDriver);

    // Redirect to login page upon successful registration
    res.render("login", { layout: "login-register" });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).send("Internal Server Error");
  }
});

// handle the login post request
app.post("/login", async (req, res) => {
  try {
    const check = await Driver.findOne({ username: req.body.username });

    if (check) {
      if (check.password === req.body.password) {
        req.session.isLoggedIn = true;
        req.session.username = req.body.username;
        res.redirect("/dashboard");
      } else {
        // Set error message for incorrect password
        res.render("login", {
          layout: "login-register",
          errorMsg: "Incorrect password",
        });
      }
    } else {
      // Set error message for user not found
      res.render("login", {
        layout: "login-register",
        errorMsg: "User not found",
      });
    }
  } catch (error) {
    console.error("Error during login:", error);
    // Set error message for internal server error
    res.render("login", { errorMsg: "Internal Server Error" });
  }
});

// handle the select order post request
app.post("/select-order/:orderId", ensureLogin, async (req, res) => {
  // Extract the order ID from the request parameters
  const orderId = req.params.orderId;

  // Retrieve the username from the session
  const username = req.session.username;

  try {
    // Retrieve the driver from the database based on the username
    const driver = await Driver.findOne({ username });

    // Check if the driver object is null or does not contain the licensePlate attribute
    if (!driver || !driver.licensePlate) {
      console.error(
        "Driver not found or does not have licensePlate attribute."
      );
      return res.status(404).send("Driver not found");
    }

    // Use the retrieved licensePlate
    const licensePlate = driver.licensePlate;

    // Attempt to update the order in the database
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      // Set the selectedByDriver field to the username and update status to "IN TRANSIT"
      {
        selectedByDriver: username,
        driverLicensePlate: licensePlate,
        status: "IN TRANSIT",
      },
      // Return the updated order after the update is applied
      { new: true }
    );

    // If the order is not found, send a 404 response
    if (!updatedOrder) {
      return res.status(404).send("Order not found");
    }

    // Redirect to the list of orders after successfully selecting the order
    res.redirect("/list-of-orders");
  } catch (error) {
    // Handle errors during the update process
    console.error("Error selecting order:", error);
    // Send a 500 Internal Server Error response
    res.status(500).send("Internal Server Error");
  }
});

// POST request to complete delivery
app.post(
  "/complete-delivery/:orderId",
  ensureLogin,
  upload.single("deliveryPhoto"),
  async (req, res) => {
    const orderId = req.params.orderId;

    try {
      // Construct the URL using the generated filename
      const imageUrl = `http://localhost:8080/images/${req.file.filename}`;

      // Updates the order status to DELIVERED and set the deliveryPhoto, date, and time
      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        {
          status: "DELIVERED",
          deliveryPhoto: imageUrl,
          deliveryDate: new Date(), // Record the delivery date
          deliveryTime: new Date().toLocaleTimeString(), // Record the delivery time
        },
        { new: true }
      );

      // If the order is not found, send a 404 response
      if (!updatedOrder) {
        return res.status(404).send("Order not found");
      }

      // Redirecting to the list of orders after completing the delivery
      res.redirect("/delivery-history");
    } catch (error) {
      // Handle errors during the update process
      console.error("Error completing delivery:", error);
      // Send a 500 Internal Server Error response
      res.status(500).send("Internal Server Error");
    }
  }
);

// POST request to handle any actions related to delivery history
app.post("/delivery-history/:orderId", ensureLogin, async (req, res) => {
  res.redirect("/delivery-history");
});

// ----------------
const onHttpStart = () => {
  console.log(`Express web server running on port: ${HTTP_PORT}`);
  console.log(`Press CTRL+C to exit`);
};
app.listen(HTTP_PORT, onHttpStart);
