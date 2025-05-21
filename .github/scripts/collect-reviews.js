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

  console.log("Review Comments:");
  console.log(input);

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
                text: `Summarize these PR reviews and suggest possible reply actions:\n\n${input}`,
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
  fs.writeFileSync(fileName, `# PR Review Summary\n\n${summary}`);

  // Step 4: Upload summary as a comment with download link
  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: `
### 🤖 Gemini PR Review Summary

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
