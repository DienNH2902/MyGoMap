import { LatestUpdatedModal } from "./LatestUpdatedModal";

interface GithubCommitResponse {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      date: string;
      name: string;
    };
  };
}

const GITHUB_OWNER = "DienNH2902";
const GITHUB_REPO = "MyGoMap";

async function getLatestCommit() {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?per_page=1`,
      {
        headers: {
          Accept: "application/vnd.github+json",
        },
        next: { revalidate: 3600 },
      },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as GithubCommitResponse[];
    return data[0] ?? null;
  } catch {
    return null;
  }
}

export async function LatestUpdatedBadge() {
  const latestCommit = await getLatestCommit();

  if (!latestCommit) {
    return null;
  }

  return (
    <LatestUpdatedModal
      sha={latestCommit.sha}
      message={latestCommit.commit.message}
      authorName={latestCommit.commit.author.name}
      updatedAt={latestCommit.commit.author.date}
    />
  );
}
