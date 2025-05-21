const { Octokit } = require("@octokit/rest");
const fs = require("fs");
const fetch = require("node-fetch");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function run() {
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
  const prNumber = process.env.GITHUB_REF.match(/refs\/pull\/(\d+)\/.*/)[1];

  const { data: comments } = await octokit.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber,
  });

  // Step 1: Format for Gemini
  const input = comments
    .map((c, i) => `Reviewer ${c.user.login}:\n${c.body}`)
    .join("\n\n");

  let fullText = "";

  for (const comment of comments) {
    try {
      const fileResp = await octokit.repos.getContent({
        owner,
        repo,
        path: comment.path,
        ref: comment.commit_id,
      });

      const content = Buffer.from(fileResp.data.content, "base64").toString(
        "utf8"
      );
      const lines = content.split("\n");
      const lineNum = comment.line;
      const context = lines
        .slice(Math.max(0, lineNum - 4), lineNum + 3)
        .join("\n");

      fullText += `
            ### Reviewer: ${comment.user.login}
            📄 File: \`${comment.path}\`
            💬 Comment: ${comment.body}

            \`\`\`js
            ${context}
            \`\`\`
            `;
    } catch (err) {
      console.warn(`⚠️ Failed to get code for ${comment.path}: ${err.message}`);
    }
  }

  const data = {
    contents: [
      {
        parts: [
          {
            text: [
              "You are an expert in Code Review.",
              "Please summarize the following PR reviews and suggest how those comments can be addressed.",
              "Please provide a summary of the comments.",
              "Also, consider the code with every review if available and suggest possible fix according to the review comments.",
              fullText,
              "Give the result in very formatted way so that It can be passed to create a markdown file",
            ].join("\n"),
          },
        ],
      },
    ],
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })
    .then(async (response) => {
      if (!response.ok) {
        const errorText = await response.text();
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `HTTP error! status: ${response.status}, details: ${errorText}`
          );
        }
        return response.json();
      }
    })
    .then(async (data) => {
      JSON.stringify(data, null, 2);
      const summary =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No summary generated.";

      // Step 3: Save to markdown
      const fileName = `review_summary_${prNumber}.md`;
      fs.writeFileSync(fileName, `# PR Review Summary\n\n${summary}`);

      // Step 4: Upload summary as a comment with download link
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: `
        ### 🤖 PR_REVIEWS_SUMMARIZER

          ${summary}

            ---

        ⬇️ [Click to download full summary](https://github.com/${owner}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}) (artifact available)
            `,
      });
    })
    .catch((err) => {
      console.error("Error:", err.message);
    });
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
