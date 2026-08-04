# Command Line Tool (CLI)

Library comes with a simple CLI for those users who want to do more advanced manipulation.

## Features

- Manipulate bookmarks, lists and tags
- Mass import/export of bookmarks

## Installation (NPM)

```
npm install -g @library/cli
```


## Installation (Docker)

```
docker run --rm ghcr.io/your-org/library-cli:release --help
```

## Usage

```
library
```

```
Usage: library [options] [command]

A CLI interface to interact with the library api

Options:
  --api-key <key>       the API key to interact with the API (env: LIBRARY_API_KEY)
  --server-addr <addr>  the address of the server to connect to (env: LIBRARY_SERVER_ADDR)
  -V, --version         output the version number
  -h, --help            display help for command

Commands:
  bookmarks             manipulating bookmarks
  lists                 manipulating lists
  tags                  manipulating tags
  whoami                returns info about the owner of this API key
  help [command]        display help for command
```

And some of the subcommands:

```
library bookmarks
```

```
Usage: library bookmarks [options] [command]

Manipulating bookmarks

Options:
  -h, --help             display help for command

Commands:
  add [options]          creates a new bookmark
  get <id>               fetch information about a bookmark
  update [options] <id>  updates bookmark
  list [options]         list all bookmarks
  delete <id>            delete a bookmark
  help [command]         display help for command

```

```
library lists
```

```
Usage: library lists [options] [command]

Manipulating lists

Options:
  -h, --help                 display help for command

Commands:
  list                       lists all lists
  delete <id>                deletes a list
  add-bookmark [options]     add a bookmark to list
  remove-bookmark [options]  remove a bookmark from list
  help [command]             display help for command
```

## Obtaining an API Key

To use the CLI, you'll need to get an API key from your library settings. You can validate that it's working by running:

```
library --api-key <key> --server-addr <addr> whoami
```

For example:

```
library --api-key mysupersecretkey --server-addr https://try.library.example.com whoami
{
  id: 'j29gnbzxxd01q74j2lu88tnb',
  name: 'Test User',
  email: 'test@gmail.com'
}
```


## Other clients

There also exists a **non-official**, community-maintained, python package called [library-python-api](https://github.com/thiswillbeyourgithub/library_python_api) that can be accessed from the CLI, but is **not** official.
