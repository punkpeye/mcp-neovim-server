#!/usr/bin/env node

/**
 * This is an MCP server that connect to neovim.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool
} from "@modelcontextprotocol/sdk/types.js";
import { NeovimManager } from "./neovim.js";

const server = new Server(
  {
    name: "mcp-neovim-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {}
    },
  }
);

const neovimManager = NeovimManager.getInstance();

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [{
      uri: `nvim://session`,
      mimeType: "text/plain",
      name: "Current neovim session",
      description: `Current neovim text editor session`
    }]
  };
});


server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (!request.params.uri.startsWith("nvim://")) {
    throw new Error("Invalid resource URI");
  }

  const bufferContents = await neovimManager.getBufferContents();

  return {
    contents: [{
      uri: request.params.uri,
      mimeType: "text/plain",
      text: Array.from(bufferContents.entries())
        .map(([lineNum, lineText]) => `${lineNum}: ${lineText}`)
        .join('\n')
    }]
  };
});

const VIM_BUFFER: Tool = {
  name: "vim_buffer",
  description: "Current VIM text editor buffer with line numbers shown",
  inputSchema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "File name to edit (can be empty, assume buffer is already open)"
      }
    },
    required: []
  }
};

const VIM_COMMAND: Tool = {
  name: "vim_command",
  description: "Send a command to VIM for navigation, spot editing, and line deletion.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Neovim command to enter for navigation and spot editing. Insert <esc> to return to NORMAL mode. It is possible to send multiple commands separated with <cr>."
      }
    },
    required: ["command"]
  }
};

const VIM_STATUS: Tool = {
  name: "vim_status",
  description: "Get the status of the VIM editor",
  inputSchema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "File name to get status for (can be empty, assume buffer is already open)"
      }
    },
    required: []
  }
};

const VIM_EDIT: Tool = {
  name: "vim_edit",
  description: "Edit lines using insert or replace in the VIM editor.",
  inputSchema: {
    type: "object",
    properties: {
      startLine: {
        type: "number",
        description: "Line number to start editing"
      },
      mode: {
        type: "string",
        enum: ["insert", "replace"],
        description: "Mode for editing lines. insert will insert lines at startLine. replace will replace lines starting at the startLine to the end of the buffer."
      },
      lines: {
        type: "string",
        description: "Lines of strings to insert or replace"
      }
    },
    required: ["startLine", "mode", "lines"]
  }
};

const NEOVIM_TOOLS = [VIM_BUFFER, VIM_COMMAND, VIM_STATUS, VIM_EDIT] as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: NEOVIM_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "vim_buffer": {
      return await handleBuffer();
    }
    case "vim_command": {
      const command = (request.params.arguments as { command: string }).command;

      return await handleCommand(command);
    }
    case "vim_status": {
      return await handleStatus();
    }
    case "vim_edit": {
      const { startLine, mode, lines } = request.params.arguments as { startLine: number, mode: 'insert' | 'replace', lines: string };
      console.error(`Editing lines: ${startLine}, ${mode}, ${lines}`);
      const result = await neovimManager.editLines(startLine, mode, lines);
      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    }
    default:
      throw new Error("Unknown tool");
  }
});

async function handleCommand(command: string) {
  console.error(`Executing command: ${command}`);
  const result = await neovimManager.sendCommand(command);
  return {
    content: [{
      type: "text",
      text: result
    }]
  };
}

async function handleBuffer() {
  const bufferContents = await neovimManager.getBufferContents();

  return {
    content: [{
      type: "text",
      text: Array.from(bufferContents.entries())
        .map(([lineNum, lineText]) => `${lineNum}: ${lineText}`)
        .join('\n')
    }]
  };
}

async function handleStatus() {
  const status = await neovimManager.getNeovimStatus();
  return {
    content: [{
      type: "text",
      text: JSON.stringify(status)
    }]
  };
}

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
