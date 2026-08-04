# Library MCP Server

This is the Library MCP server, which is a server that can be used to interact
with Library from other tools.

## Supported Tools

- Searching bookmarks
- Adding and removing bookmarks from lists
- Attaching and detaching tags to bookmarks
- Creating new lists
- Creating text and URL bookmarks

Currently, the MCP server only exposes tools (no resources).

## Usage with Claude Desktop

From NPM:

```json
{
  "mcpServers": {
    "library": {
      "command": "npx",
      "args": [
        "@library/mcp"
      ],
      "env": {
        "LIBRARY_API_ADDR": "https://<YOUR_SERVER_ADDR>",
        "LIBRARY_API_KEY": "<YOUR_TOKEN>",
        "LIBRARY_CUSTOM_HEADERS": "{\"CF-Access-Client-Id\": \"...\", \"CF-Access-Client-Secret\": \"...\"}"
      }
    }
  }
}
```

From Docker:

```json
{
  "mcpServers": {
    "library": {
      "command": "docker",
      "args": [
        "run",
        "-e",
        "LIBRARY_API_ADDR=https://<YOUR_SERVER_ADDR>",
        "-e",
        "LIBRARY_API_KEY=<YOUR_TOKEN>",
        "-e",
        "LIBRARY_CUSTOM_HEADERS={\"CF-Access-Client-Id\": \"...\", \"CF-Access-Client-Secret\": \"...\"}",
        "ghcr.io/your-org/library-mcp:latest"
      ]
    }
  }
}
```
