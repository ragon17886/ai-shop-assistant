// Cloudflare Worker for AI Shop Assistant Prototype
// Handles requests from Telegram/CRM and acts as a secure proxy for the Admin Panel.

// --- Configuration and Constants ---
const GITHUB_API_URL = "https://api.github.com";
const GEMINI_MODEL = "gemini-2.5-flash"; // Free tier model

// --- Helper Functions ---

/**
 * Fetches the current prompts.json content and its SHA from GitHub.
 * @param {string} owner - GitHub repository owner.
 * @param {string} repo - GitHub repository name.
 * @param {string} path - Path to the prompts file.
 * @returns {Promise<{content: string, sha: string}>}
 */
async function fetchPromptsFromGitHub(owner, repo, path) {
    const url = `${GITHUB_API_URL}/repos/${owner}/${repo}/contents/${path}`;
    
    // First request to get the file metadata, including SHA
    const metadataResponse = await fetch(url, {
        headers: {
            "Accept": "application/vnd.github.v3+json"
        }
    });

    if (!metadataResponse.ok) {
        throw new Error(`Failed to fetch prompts metadata from GitHub: ${metadataResponse.statusText}`);
    }
    
    const metadata = await metadataResponse.json();
    const sha = metadata.sha;
    
    // Second request to get the raw content
    const contentResponse = await fetch(metadata.download_url);
    
    if (!contentResponse.ok) {
        throw new Error(`Failed to fetch raw prompts content from GitHub: ${contentResponse.statusText}`);
    }
    
    const content = await contentResponse.text();
    
    return { content, sha };
}

/**
 * Calls the Gemini API with the given prompt and user message.
 * @param {string} promptTemplate - The system prompt template.
 * @param {string} userMessage - The user's message.
 * @param {string} apiKey - The Gemini API key.
 * @returns {Promise<string>} The AI's response.
 */
async function callGeminiApi(promptTemplate, userMessage, apiKey) {
    // Simple replacement for the prototype. In a real app, you'd use a proper templating engine.
    const finalPrompt = promptTemplate
        .replace(/\{\{user_preferences\}\}/g, userMessage)
        .replace(/\{\{product_data\}\}/g, "данные о товарах") // Placeholder for real data
        .replace(/\{\{size_chart\}\}/g, "таблица размеров") // Placeholder for real data
        .replace(/\{\{user_measurements\}\}/g, userMessage) // Using user message as a proxy for measurements
        .replace(/\{\{order_number\}\}/g, userMessage) // Using user message as a proxy for order number
        .replace(/\{\{order_status_data\}\}/g, "статус заказа"); // Placeholder for real data

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API Raw Error:", errorText);
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const json = await response.json();
    
    // Basic error handling and extraction
    if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) {
        return json.candidates[0].content.parts[0].text;
    } else {
        return "Извините, не удалось получить ответ от AI. Попробуйте перефразировать запрос.";
    }
}

// --- Route Handlers ---

/**
 * Handles the main AI chat request (used by Telegram/CRM).
 * @param {Request} request
 * @param {object} env - Environment variables/secrets.
 */
async function handleChat(request, env) {
    try {
        const { message, function_id } = await request.json();
        
        if (!message || !function_id) {
            return new Response(JSON.stringify({ error: "Missing 'message' or 'function_id'" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        
        if (!env.GEMINI_API_KEY) {
            return new Response(JSON.stringify({ error: "GEMINI_API_KEY is not configured." }), { status: 500, headers: { "Content-Type": "application/json" } });
        }

        // 1. Fetch Prompts
        const { content: promptsContent } = await fetchPromptsFromGitHub(env.GITHUB_OWNER, env.GITHUB_REPO, env.PROMPTS_PATH);
        const prompts = JSON.parse(promptsContent);
        
        const selectedPrompt = prompts.find(p => p.id === function_id);

        if (!selectedPrompt) {
            return new Response(JSON.stringify({ error: `Function ID '${function_id}' not found.` }), { status: 404, headers: { "Content-Type": "application/json" } });
        }

        // 2. Call Gemini API
        const aiResponse = await callGeminiApi(selectedPrompt.prompt, message, env.GEMINI_API_KEY);

        return new Response(JSON.stringify({ response: aiResponse }), { status: 200, headers: { "Content-Type": "application/json" } });

    } catch (error) {
        console.error("Chat Error:", error.message);
        return new Response(JSON.stringify({ error: `Internal Server Error during chat processing: ${error.message}` }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}

/**
 * Handles the secure proxy request from the Admin Panel to save prompts to GitHub.
 * @param {Request} request
 * @param {object} env - Environment variables/secrets.
 */
async function handleSavePrompts(request, env) {
    // This route requires the GITHUB_PAT secret.
    if (!env.GITHUB_PAT) {
        return new Response(JSON.stringify({ error: "GITHUB_PAT secret is not configured." }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    try {
        const newPromptsJson = await request.json();
        const newPromptsContent = JSON.stringify(newPromptsJson, null, 4);
        
        // 1. Get current file SHA (required for update)
        const { sha } = await fetchPromptsFromGitHub(env.GITHUB_OWNER, env.GITHUB_REPO, env.PROMPTS_PATH);

        // 2. Commit the new content
        const contentUrl = `${GITHUB_API_URL}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.PROMPTS_PATH}`;
        const commitBody = JSON.stringify({
            message: "Update prompts.json from Admin Panel",
            content: btoa(newPromptsContent), // Base64 encode the content
            sha: sha
        });

        const commitResponse = await fetch(contentUrl, {
            method: "PUT",
            headers: {
                "Authorization": `token ${env.GITHUB_PAT}`,
                "Content-Type": "application/json",
                "Accept": "application/vnd.github.v3+json"
            },
            body: commitBody
        });

        if (!commitResponse.ok) {
            const errorText = await commitResponse.text();
            throw new Error(`Failed to commit to GitHub: ${commitResponse.status} - ${errorText}`);
        }

        return new Response(JSON.stringify({ success: true, message: "Prompts successfully saved and committed to GitHub." }), { status: 200, headers: { "Content-Type": "application/json" } });

    } catch (error) {
        console.error("Save Prompts Error:", error.message);
        return new Response(JSON.stringify({ error: `Internal Server Error during prompt saving: ${error.message}` }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}

// --- Telegram Bot Functions ---

/**
 * Sends a message back to the Telegram user.
 * @param {string} chatId - The chat ID to send the message to.
 * @param {string} text - The message text.
 * @param {string} token - The Telegram Bot Token.
 */
async function sendTelegramMessage(chatId, text, token) {
    const telegramApiUrl = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(telegramApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: "Markdown"
        }),
    });
}

/**
 * Handles incoming Telegram Webhook updates.
 * @param {Request} request
 * @param {object} env - Environment variables/secrets.
 */
async function handleTelegramWebhook(request, env) {
    if (!env.TELEGRAM_BOT_TOKEN) {
        return new Response("TELEGRAM_BOT_TOKEN is not configured.", { status: 500 });
    }

    try {
        const update = await request.json();
        const message = update.message;

        if (!message || !message.text) {
            return new Response("OK", { status: 200 }); // Ignore non-text messages
        }

        const chatId = message.chat.id;
        const userText = message.text.trim();
        
        // For the prototype, we default to the product recommendation function.
        // In a real app, you'd use commands or NLP to determine the function_id.
        const functionId = "product_recommendation"; 

        // Simulate a call to the internal chat handler
        const chatRequest = new Request("https://placeholder.com/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: userText, function_id: functionId }),
        });

        const chatResponse = await handleChat(chatRequest, env);
        const chatJson = await chatResponse.json();

        let responseText;
        if (chatJson.error) {
            responseText = `Произошла ошибка: ${chatJson.error}`;
        } else {
            responseText = chatJson.response;
        }

        await sendTelegramMessage(chatId, responseText, env.TELEGRAM_BOT_TOKEN);

        return new Response("OK", { status: 200 });

    } catch (error) {
        console.error("Telegram Webhook Error:", error.message);
        // Send a generic error message back to the user
        if (update && update.message && update.message.chat) {
             await sendTelegramMessage(update.message.chat.id, "Извините, произошла внутренняя ошибка сервера.", env.TELEGRAM_BOT_TOKEN);
        }
        return new Response("Error", { status: 500 });
    }
}

// --- Main Worker Listener ---

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // Handle CORS preflight requests
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                }
            });
        }

        // Set CORS headers for all responses
        const headers = {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        };

        if (url.pathname === "/api/chat" && request.method === "POST") {
            const response = await handleChat(request, env);
            return new Response(response.body, { status: response.status, headers });
        }

        if (url.pathname === "/api/save-prompts" && request.method === "POST") {
            const response = await handleSavePrompts(request, env);
            return new Response(response.body, { status: response.status, headers });
        }
        
        if (url.pathname === "/telegram-webhook" && request.method === "POST") {
            // No CORS headers needed for Telegram webhook
            return handleTelegramWebhook(request, env);
        }

        return new Response(JSON.stringify({ message: "AI Shop Assistant Worker is running." }), { status: 200, headers });
    },
};
