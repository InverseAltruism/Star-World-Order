# Model Context Protocol (MCP) Configuration for Star World Order

This document provides recommended MCP server configurations for GitHub Copilot coding agent when working with the Star World Order repository.

---

## What is MCP?

The Model Context Protocol (MCP) is an open standard that defines how applications share context with large language models (LLMs). MCP provides a standardized way to connect AI models to different data sources and tools, enabling them to work together more effectively.

---

## Recommended MCP Configuration

To configure MCP servers for Copilot coding agent, navigate to:

**GitHub Repository Settings** → **Copilot** → **Coding agent** → **MCP configuration**

### Basic Configuration (JSON)

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/runner/work/Star-World-Order/Star-World-Order"
      ]
    }
  }
}
```

### Extended Configuration with GitHub Integration

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/runner/work/Star-World-Order/Star-World-Order"
      ]
    },
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_TOKEN": "GITHUB_TOKEN"
      }
    }
  }
}
```

**Note**: The `GITHUB_TOKEN` environment variable is automatically provided by GitHub Actions. For personal use, you may need to configure a personal access token with appropriate scopes (repo, read:org).

---

## Available MCP Servers

### Recommended for Star World Order

| Server | Package | Purpose |
|--------|---------|---------|
| **Filesystem** | `@modelcontextprotocol/server-filesystem` | Read/write access to repository files |
| **GitHub** | `@modelcontextprotocol/server-github` | GitHub API integration (PRs, issues) |
| **Memory** | `@modelcontextprotocol/server-memory` | Persistent context between sessions |

### Optional Servers

| Server | Package | Purpose |
|--------|---------|---------|
| **Fetch** | `@modelcontextprotocol/server-fetch` | HTTP requests to external APIs |
| **SQLite** | `@modelcontextprotocol/server-sqlite` | Direct database access |
| **Brave Search** | `@modelcontextprotocol/server-brave-search` | Web search capabilities |

---

## Configuration for Different Use Cases

### Frontend Development

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/runner/work/Star-World-Order/Star-World-Order/app",
        "/home/runner/work/Star-World-Order/Star-World-Order/components",
        "/home/runner/work/Star-World-Order/Star-World-Order/lib"
      ]
    }
  }
}
```

### Smart Contract Development

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/runner/work/Star-World-Order/Star-World-Order/contracts"
      ]
    }
  }
}
```

### Full Repository Access

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/runner/work/Star-World-Order/Star-World-Order"
      ]
    },
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_TOKEN": "GITHUB_TOKEN"
      }
    },
    "memory": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-memory"
      ]
    }
  }
}
```

---

## Environment Variables for MCP

Some MCP servers require environment variables:

| Variable | Server | Purpose |
|----------|--------|---------|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub | API authentication |
| `BRAVE_API_KEY` | Brave Search | Search API access |

---

## Testing MCP Configuration

After configuring MCP, test that it's working by:

1. Creating a new issue and assigning it to Copilot
2. Checking that the agent can:
   - Read repository files
   - Understand the project structure
   - Make appropriate code changes
   - Run validation commands

---

## Troubleshooting

### MCP Server Not Starting

1. Ensure the package is available: `npm install -g @modelcontextprotocol/server-filesystem`
2. Check JSON syntax in configuration
3. Verify file paths exist

### Permission Errors

1. Ensure the repository directory is accessible
2. Check that the agent has read/write permissions
3. Verify the GitHub token has appropriate scopes

### Server Timeout

1. Increase timeout settings if available
2. Consider limiting the filesystem scope
3. Check for large files that might slow down indexing

---

## Additional Resources

- [MCP Official Documentation](https://modelcontextprotocol.io/)
- [GitHub Copilot Coding Agent Docs](https://docs.github.com/en/copilot/using-github-copilot/using-copilot-coding-agent)
- [MCP Server Registry](https://github.com/modelcontextprotocol/servers)

---

**Note**: MCP configuration is optional. GitHub Copilot coding agent works without MCP but may have enhanced capabilities with it configured.
