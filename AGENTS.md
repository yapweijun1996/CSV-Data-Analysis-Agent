# Convert "Original" React Project to Vanilla Frontend Project

* help to convert the react js project(folder "Original") to vanilla frontend project. 
* In this process we can improve Vanilla Project better than react, if some features from react No good, then we can make it better in Vanilla Project.
* Vanilla Frontend is HTML CSS Javascript.
* Dont use React JS and Tailwind CSS.
* Do not amend folder "Original"
* Keep the Vanilla Project Agent logic is multi-step, like iterative worker method style, able to solve complex issues or problem by tools.
* Do no hardcode logic to Agent, if not Agent cannot perform Task Intelligently.
* Update Info in README.md, about the logic and structure and Agent logic and so on, allow Engineer to easy to understand and cheap to maintain.
* Write comment for code allow us to know what the code is trying to do and wont get lost.

## CSV Agent Ability Design
* 像員工一樣 small step、小步驟連續執行multi-step task
* Able to plan next step, agent know what to do next.
* Show log in chatlog to let user know what the Agent doing.
* Show Agent thinking.
* Step-by-step perform task sequential
* Agent like iterative worker.
* Explanation：
1. 初始化：在任務複雜度較高時呼叫 update_plan 建立 2 以上步驟的 todo 清單。
2. 執行：每完成一個子任務或切換到下一步時，再呼叫一次 update_plan 將上一項改為 completed、下一項設為in_progress。
3. 調整：若中途發現需要新增/調整步驟，先思考並在新呼叫中加入或重排項目，確保只有一個 in_progress。
4. 結束：全部完成後用最後一次 update_plan 標記所有步驟為 completed，easy for use to check
*作為agent，在面對複雜任務時，如何用多步驟方式管理與解決?
1. 先拆解需求成可驗證的小模組，使用 update_plan/todo 確保每步可追蹤
2. 保持聊天紀錄顯示思考與進度，讓User隨時知道Agent做到哪一步。
3. Agent Side: 先理解需求→切分成小目標→規劃計畫→執行每個小步驟並即時更新→驗證結果→回報並準備下一迭代。 方法細節：
- Step 1 Diagnose：分析題目與限制，確認需輸出什麼、不可做什麼，列出疑點。
- Step 2 Plan：建立 2~4 個核心 todo（若更複雜再拆子步驟），必要時透過 update_plan 標註 pending/in_progress/completed。
- Step 3 Execute：針對每一小步採取單一動作（例如閱讀檔案、改一段程式、跑一支 script），完成即回報，確保一次只專注一件事。
- Step 4 Log：在對話中同步記錄Agent正在做什麼、遇到什麼、下一步打算做什麼，讓user看到 agent thinking。
- Step 5 Adjust：若途中發現新需求或阻礙，重新評估待辦、更新計畫，再繼續小步前進。
- Step 6 Verify：每完成一輪迭代都檢查結果是否符合預期，如需測試/檢查檔案，也會回報結果。
* 若執行時拋錯，應該把錯誤訊息傳回 agent，讓它理解失敗原因並重試.

## Rules

### Main Rules
* Think hard about this.
* reply in mandarin english mixed.
* step by step with small action by todo list.
* reply me in listing format, eg: 1,2,3.....
* Restate user’s query with your understanding.

---

### Quick Check**

* Suggestion from engineer View.
* Suggestion from user view.

---

### Response to User**

* Generate response to user.
* Reply me in mandarin english mixed.
* Provide 3 option to user to choose for next step or next action. eg: A, B, C


---

### Others Info
* We need to focus on .js
* No node js no server needed.
* fully frontend.
* when review issues or bug, no need provide code, only breakdown issues or bug only.