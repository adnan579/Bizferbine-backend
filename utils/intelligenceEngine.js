const { Event, EventRegistration, ExecutionIntent, Workspace, EventIntelligence } = require('../models/CoreSchemas');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const compileEventIntelligence = async (eventId) => {
    try {
        console.log(`🧠 [Intelligence Engine] Compiling AI post-mortem for Event: ${eventId}`);

        // 1. Gather all raw ecosystem data for this event
        const event = await Event.findById(eventId);
        const attendees = await EventRegistration.find({ event: eventId }).populate('user', 'name role industry');
        const intents = await ExecutionIntent.find({ eventContext: eventId }).populate('initiator target', 'name');

        if (!event || attendees.length === 0) return null;

        // 2. Prepare the data payload for the LLM
        const payload = {
            eventName: event.title,
            attendeeCount: attendees.length,
            executionIntentsFired: intents.length,
            intentDetails: intents.map(i => `${i.initiator?.name} proposed [${i.intentType}] to ${i.target?.name}`)
        };

        // 3. Initialize Gemini
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: "You are an elite Startup Ecosystem Analyst. Analyze the raw event data JSON provided. Return your response STRICTLY as a JSON object with the following structure: { \"executiveSummary\": \"A 2-sentence summary of the event's execution velocity\", \"highRoiRooms\": [\"List of 2 trending topics or synergies\"], \"missedOpportunities\": [\"1-2 suggestions for connections that should have happened but didn't\"] }. Do not use markdown backticks."
        });

        // 4. Generate AI Insights with Resilient Parsing
        const result = await model.generateContent(JSON.stringify(payload));
        let responseText = result.response.text();

        // Sanitize markdown and extract pure JSON block
        responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);

        let aiData;
        try {
            aiData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
        } catch (parseError) {
            console.error('🚨 [Intelligence Engine] JSON Parse Failure. Falling back to safe defaults.', parseError);
            aiData = { executiveSummary: "Data compilation yielded anomalous results.", highRoiRooms: [], missedOpportunities: [] };
        }

        // 5. Store in the Intelligence Layer
        const newIntelligence = new EventIntelligence({
            event: eventId,
            executiveSummary: aiData.executiveSummary,
            highRoiRooms: aiData.highRoiRooms,
            missedOpportunities: aiData.missedOpportunities
        });

        await newIntelligence.save();
        console.log(`✅ [Intelligence Engine] Event AI Summary generated and locked.`);
        return newIntelligence;

    } catch (error) {
        console.error('❌ [Intelligence Engine] Compilation Failed:', error);
        return null;
    }
};

module.exports = { compileEventIntelligence };