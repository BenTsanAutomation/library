# Model Context Protocol Server (MCP)

Library comes with a Model Context Protocol server that can be used to interact with it through LLMs.

## Supported Tools

- Searching bookmarks
- Adding and removing bookmarks from lists
- Attaching and detaching tags to bookmarks
- Creating new lists
- Creating text and URL bookmarks


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
        "LIBRARY_API_KEY": "<YOUR_TOKEN>"
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
        "ghcr.io/your-org/library-mcp:latest"
      ]
    }
  }
}
```


### Demo

#### Search
![mcp-1](/img/mcp-1.gif)

#### Adding Text Bookmarks
![mcp-2](/img/mcp-2.gif)

#### Adding URL Bookmarks
![mcp-2](/img/mcp-3.gif)
