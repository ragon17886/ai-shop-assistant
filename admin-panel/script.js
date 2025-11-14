const PROMPTS_FILE = '../prompts.json';
const PROMPTS_CONTAINER = document.getElementById('prompts-container');
const SAVE_BUTTON = document.getElementById('save-all-btn');
const STATUS_MESSAGE = document.getElementById('status-message');

let promptsData = [];
let originalFileSha = '';

// --- Utility Functions ---

function showStatus(message, isError = false) {
    STATUS_MESSAGE.textContent = message;
    STATUS_MESSAGE.style.color = isError ? 'red' : 'green';
}

function renderPrompts() {
    PROMPTS_CONTAINER.innerHTML = '';
    promptsData.forEach((prompt, index) => {
        const card = document.createElement('div');
        card.className = 'prompt-card';
        card.innerHTML = `
            <h3>${prompt.name} (${prompt.id})</h3>
            <label for="name-${index}">Название функции:</label>
            <input type="text" id="name-${index}" value="${prompt.name}" data-index="${index}" data-field="name">

            <label for="description-${index}">Описание:</label>
            <input type="text" id="description-${index}" value="${prompt.description}" data-index="${index}" data-field="description">

            <label for="prompt-${index}">Промпт (шаблон):</label>
            <textarea id="prompt-${index}" data-index="${index}" data-field="prompt">${prompt.prompt}</textarea>
        `;
        card.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('input', handleInputChange);
        });
        PROMPTS_CONTAINER.appendChild(card);
    });
    SAVE_BUTTON.disabled = true;
}

function handleInputChange(event) {
    const index = event.target.dataset.index;
    const field = event.target.dataset.field;
    promptsData[index][field] = event.target.value;
    SAVE_BUTTON.disabled = false;
    showStatus('Есть несохраненные изменения. Нажмите "Сохранить" для фиксации.', false);
}

// --- GitHub API Interaction ---

async function fetchPrompts() {
    showStatus('Загрузка промптов...');
    try {
        // Fetch the raw content of prompts.json
        const response = await fetch(PROMPTS_FILE);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        promptsData = await response.json();
        renderPrompts();
        showStatus('Промпты успешно загружены.', false);

        // NOTE: For a real implementation, we would need to fetch the file's SHA
        // to be able to commit changes back using the GitHub API.
        // Since this is a prototype plan, we will simulate the save process
        // and instruct the user on the necessary steps for a live version.
        
    } catch (error) {
        showStatus(`Ошибка загрузки промптов: ${error.message}. Убедитесь, что файл ${PROMPTS_FILE} существует.`, true);
    }
}

async function savePrompts() {
    // --- CRITICAL NOTE FOR THE USER ---
    // In a real GitHub Pages setup, saving requires the GitHub API, which needs:
    // 1. A Personal Access Token (PAT) with 'repo' scope.
    // 2. The SHA of the file being updated.
    // 3. A CORS-enabled proxy or a serverless function (like our Cloudflare Worker)
    //    to handle the commit, as direct browser-to-GitHub API commits are complex
    //    due to security/CORS and exposing the PAT.
    //
    // For this prototype, we will use the Cloudflare Worker (Phase 3) as a secure
    // proxy to handle the commit operation, which is the best practice.
    // The admin panel will send the new JSON data to the Worker, and the Worker
    // will use its secrets (PAT) to commit to GitHub.

    showStatus('Сохранение промптов (Отправка данных на Cloudflare Worker)...', false);
    SAVE_BUTTON.disabled = true;

    const newContent = JSON.stringify(promptsData, null, 4);
    
    // In the final implementation, replace this with a fetch call to the Cloudflare Worker URL:
    // const workerUrl = 'YOUR_CLOUDFLARE_WORKER_URL/save-prompts';
    // const response = await fetch(workerUrl, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: newContent
    // });

    // SIMULATION:
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay

    // If the Worker successfully commits the change:
    // showStatus('Промпты успешно сохранены и зафиксированы в репозитории!', false);
    // fetchPrompts(); // Reload to get the new SHA

    // Since we don't have the Worker yet, we show the required next step:
    showStatus('Промпты готовы к сохранению. В реальной реализации эти данные будут отправлены на Cloudflare Worker для безопасного коммита в GitHub.', false);
    SAVE_BUTTON.disabled = false;
}

// --- Event Listeners ---

SAVE_BUTTON.addEventListener('click', savePrompts);

// --- Initialization ---

document.addEventListener('DOMContentLoaded', fetchPrompts);
