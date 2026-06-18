// routes/payments.js
const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');

// Initialize Stripe with a test secret key
// (In production, this will be safely stored in an environment variable)
const stripe = require('stripe')('sk_test_51DummyTestKeyDoNotUseInProduction123456789');

const router = express.Router();

// --- ROUTE 1: CREATE A CHECKOUT SESSION ---
// URL: POST /api/payments/create-checkout-session
router.post('/create-checkout-session', authMiddleware, async (req, res) => {
  try {
    const { eventTitle, ticketPrice, tier } = req.body;

    // Validate that we received the necessary data
    if (!eventTitle || !ticketPrice) {
      return res.status(400).json({ message: 'Event title and ticket price are required.' });
    }

    // Tell Stripe to create a secure checkout page
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'], // We want to accept credit cards
      line_items: [
        {
          price_data: {
            currency: 'usd', // You can change this to 'inr', 'eur', etc.
            product_data: {
              name: tier ? `${tier} Ticket: ${eventTitle}` : eventTitle,
              description: tier ? `Admission ticket for ${eventTitle} (${tier} Tier)` : `Admission ticket for ${eventTitle}`
            },
            // CRUCIAL: Stripe calculates everything in the smallest currency unit (cents). 
            // So, $50.00 must be sent as 5000. We multiply by 100 here!
            unit_amount: ticketPrice * 100,
          },
          quantity: 1, // Buying 1 ticket at a time
        },
      ],
      mode: 'payment',
      // These are dummy URLs for now. When you build the frontend, we will redirect the user here!
      success_url: 'http://localhost:3000/payment-success',
      cancel_url: 'http://localhost:3000/payment-cancelled',
    });

    // Send the generated secure URL back to the user
    res.status(200).json({
      message: 'Checkout session created successfully!',
      checkoutUrl: session.url
    });

  } catch (error) {
    console.error('Stripe Error:', error);
    res.status(500).json({ message: 'Server error creating payment session.' });
  }
});

module.exports = router;