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

  console.log("Review Data Sent to Gemini:\n", fullText);

  console.log("Review Comments:");
  console.log(fullText);

  // Step 2: Send to Gemini
  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Summarize these PR reviews and suggest possible reply actions:\n\n${fullText}`,
              },
            ],
          },
        ],
      }),
    }
  );

  const geminiData = await geminiResponse.json();
  const summary =
    geminiData.candidates?.[0]?.content?.parts?.[0]?.text ||
    "No summary generated.";

  console.log("Gemini Summary:\n", summary);

  // Step 3: Save to markdown
  const fileName = `review_summary_${prNumber}.md`;
  fs.writeFileSync(fileName, `# PR Review Summary\n\n${fullText}`);

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

  // Step 5: Upload as GitHub Artifact (optional)
  // Done automatically by Actions if you add upload step in .yml
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
