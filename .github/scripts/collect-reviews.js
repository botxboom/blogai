const { Octokit } = require("@octokit/rest");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GITHUB_TOKEN || !GEMINI_API_KEY) {
  console.error("Missing GitHub or Gemini API key");
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function run() {
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
  const prNumber =
    process.env.PR_NUMBER || process.env.GITHUB_REF?.split("/").pop();

  if (!prNumber) {
    console.error("Missing PR number");
    process.exit(1);
  }

  const { data: comments } = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
    {
      owner,
      repo,
      pull_number: prNumber,
    }
  );

  if (comments.length === 0) {
    console.log("No review comments found.");
    return;
  }

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
      console.error(
        `Failed to get code for comment on ${comment.path}:`,
        err.message
      );
    }
  }

  console.log("Review Data Sent to Gemini:\n", fullText);

  // Gemini API call (using Vertex API, not AI Studio)
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Summarize and suggest review replies or code changes for the following PR review:\n\n${fullText}`,
              },
            ],
          },
        ],
      }),
    }
  );

  const gemini = await response.json();

  const summary =
    gemini?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "❌ Gemini returned no summary.";

  console.log("Gemini Summary:", summary);

  // Save markdown summary
  const filename = `review_summary_pr${prNumber}.md`;
  fs.writeFileSync(filename, `# PR Review Summary\n\n${fullText}`);

  // Post back to GitHub as a PR comment
  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: `🤖 **Automated PR Review Summary by PR_SUMMARIZER**\n\n${summary}`,
  });

  console.log("✅ Summary posted to PR and saved to file.");
}

run().catch((err) => {
  console.error("Error in summarizer:", err);
  process.exit(1);
});
