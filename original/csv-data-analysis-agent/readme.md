# 🧠 CSV Data Analysis Agent

An intelligent, private, web-based AI assistant that automates CSV data analysis. Upload a `.csv` file and let the agent auto-read, understand, and generate multiple aggregated views, interactive charts, and business intelligence-style reports — all locally in your browser for maximum privacy.

This advanced tool allows users to have a conversation with their data, asking for specific analyses, getting summaries, and even directing the AI to manipulate the UI and the data itself to better highlight insights.

## ✨ Key Features

*   **Uncompromising Privacy (Local-First)**: Your privacy is paramount. All CSV parsing and data aggregation happens directly in your browser via Web Workers and JavaScript. Your raw data file **never** leaves your computer. For AI-powered analysis, only the column names (the schema) and a small, representative sample of the data (typically 5-20 rows) are sent to your chosen AI provider (Google Gemini or OpenAI) to generate insights. The full dataset remains local at all times.

*   **Planner + ReAct Framework**: For complex requests, the agent now acts as a planner. It first formulates a step-by-step plan, announces it, and then executes that plan using the Reason+Act (ReAct) model.
    *   **Explicit Planning**: Before starting a multi-step task, the AI will state its plan in its "thought" process (e.g., "My plan is to: 1. Filter the data. 2. Create a chart. 3. Summarize the results."). This makes its strategy clear from the outset.
    *   **Sequential Execution**: The agent executes the plan by chaining multiple tools together in a sequence. It can perform a data transformation, then create several analysis cards from the new data, and finally provide a text summary that synthesizes the results, all in response to a single prompt.
    *   **Full Self-Explanation**: The agent remembers every action it takes, including the initial data preparation script. You can ask it, "Where did the 'Software Product 10' value come from?", and it will consult its logs to explain exactly how it cleaned and standardized the raw data, building trust and ensuring reproducibility.

*   **AI-Powered Data Preparation**: The assistant acts as a data engineer. It intelligently analyzes your raw CSV for complex structures, summary rows, or other anomalies. It then writes and executes a custom JavaScript function on-the-fly to clean and reshape your data into a tidy, analysis-ready format.

*   **AI Quality Gate & Smart Defaults**: The agent doesn't just blindly generate charts. It uses a two-step "quality gate" process. After generating initial ideas, it acts as its own quality reviewer, analyzing the aggregated data for each potential chart. It automatically discards uninteresting or "rubbish" charts (like those with no data variation) and for charts with many categories, it intelligently sets a default "Top 8" view with "Others" hidden, ensuring you start with clean, insightful, and readable visualizations.

*   **Persistent Session History**: Your work is always safe. The app continuously saves your current analysis to a "live session". If you reload the page, you'll be right back where you left off. When you upload a new file, your previous session is automatically archived to the History panel.

*   **Configurable AI Settings**:
    *   Choose between Google Gemini and OpenAI as your AI provider.
    *   Securely use your own API key for the selected provider.
    *   Switch between powerful models like `gemini-2.5-pro`, `gemini-2.5-flash`, `gpt-4o`, and `gpt-4-turbo`.
    *   Choose the agent's response language.

*   **AI-Powered Analysis Generation**: On file upload, the AI assistant proactively generates a set of 4 to 12 diverse and insightful analysis plans and visualizes them as cards. It also provides a **"Core Analysis Briefing"** in the chat, summarizing its initial understanding of your data to establish a shared context for your conversation.

*   **Interactive & Customizable Charts**:
    *   Switch between Bar, Line, Pie, Doughnut, and Scatter charts on-the-fly for any analysis.
    *   **Top N Filtering**: Focus on what matters. For charts with many categories, you can instantly filter to see the "Top 5", "Top 8", "Top 10", or "Top 20" items, with all others grouped into an "Others" category. You can also hide the "Others" group for a clearer view.
    *   Zoom and pan on charts to explore dense data.
    *   Click on data points to see details and multi-select for comparison.

*   **Conversational AI Chat & Dynamic Interaction**: Engage in a dialogue with the AI to command the interface and data.
    *   **Insightful "Point and Talk"**: The AI can highlight a relevant chart and then follow up with a detailed text explanation. When it discusses a specific chart, a **"Show Related Card"** button appears with its message, allowing you to instantly jump to the visualization it's referencing.
    *   **Interactive Filtering**: Ask the AI to "On the sales chart, show me only the Marketing and Engineering departments." The AI will apply the filter to the card instantly.
    *   **On-the-Fly JavaScript Execution**: For complex tasks, the AI can write and execute its own JavaScript during the conversation. For example, ask it to **"Create a new 'Profit' column by subtracting 'Costs' from 'Revenue'"**. The AI will generate and run the code, update the dataset, and make the new 'Profit' column available for further analysis.

*   **Comprehensive Export Options**: Export any analysis card as a PNG image, a CSV file of the aggregated data, or a full HTML report.

*   **Responsive Design**: A clean, modern interface that works seamlessly on different screen sizes, with a resizable and collapsible assistant panel.

## ⚙️ Configuration

To use the AI-powered features, you need to select an AI provider and configure your API key.

1.  Click the **Settings** icon (⚙️) in the top-right of the Assistant panel.
2.  **AI Provider**: Choose between Google Gemini and OpenAI.
3.  **API Key**: Paste your API key for the selected provider. You can get a Gemini key from [Google AI Studio](https://aistudio.google.com/app/apikey) or an OpenAI key from the [OpenAI Platform](https://platform.openai.com/api-keys).
4.  **AI Model**: Choose from the available models for your selected provider (e.g., `gemini-2.5-pro`, `gpt-4o`).
5.  **Agent Language**: Select the primary language for the AI's responses and summaries.

Your settings are saved securely in your browser's local storage and are never transmitted anywhere else.

## 🚀 How to Use

1.  **Configure your AI Provider & API Key**: Before you begin, open the settings (⚙️), select your preferred AI provider (Google Gemini or OpenAI) and add your API Key.
2.  **Upload a CSV file**: Drag and drop your file or use the file selector. This starts a new session. The AI will automatically clean and reshape the data if needed. Your work is saved automatically.
3.  **Review Auto-Analysis**: The assistant will automatically generate several analysis cards and then present its **Core Analysis Briefing** in the chat window. This is your shared starting point.
4.  **Interact with Charts**:
    *   Use the icons on a card to switch between bar, line, and pie charts.
    *   Use the "Show Top" dropdown to filter noisy charts.
    *   Use your mouse wheel to zoom and click-and-drag to pan on complex charts.
    *   Click on bars, slices, or points to select them. Hold `Ctrl` or `Cmd` to multi-select.
5.  **Chat with the Assistant**:
    *   Open the side panel to chat. Ask for a new view (e.g., "Count of products by category").
    *   Ask a question about the data (e.g., "What's the average order value in the sales performance chart?").
    *   Ask the AI to guide you (e.g., "Highlight the most important chart and explain it to me"). Click the "Show Related Card" button on the AI's response to navigate directly to the chart it is discussing.
    *   Ask the AI to perform complex actions (e.g., "Create a new column called 'Efficiency' by dividing 'Output' by 'Hours'").
6.  **Manage History**: Click the "History" button in the main header to see all your past reports. You can load a previous session to continue your work or delete old reports.
7.  **Export Your Findings**: Use the export menu on any card to save your work as a PNG, CSV, or a full HTML report.

## 🛠️ Tech Stack

*   **Frontend**: React, TypeScript, Tailwind CSS
*   **AI**: Google Gemini API, OpenAI API
*   **Charting**: Chart.js with `chartjs-plugin-zoom`
*   **CSV Parsing**: PapaParse
*   **Local Storage**: IndexedDB (for session reports) & LocalStorage (for settings) via the `idb` library.