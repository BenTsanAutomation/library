# Debian 12/Ubuntu 24.04

:::warning
This script is a stripped-down version of those found in the [Proxmox Community Scripts](https://github.com/community-scripts/ProxmoxVE) repo. It has been adapted to work on baremetal Debian 12 or Ubuntu 24.04 installs **only**. Any other use is not supported and you use this script at your own risk.
:::

### Requirements

- **Debian 12** (Buster) or
- **Ubuntu 24.04** (Noble Numbat)

The script will download and install all dependencies (except for Ollama), install Library, do a basic configuration of Library and Meilisearch (the search app used by Library), and create and enable the systemd service files needed to run Library on startup. Library and Meilisearch are run in the context of their low-privilege user environments for more security.

The script functions as an update script in addition to an installer. See **[Updating](#updating)**.

### 1. Download the script from the [Library repository](https://github.com/your-org/library/blob/main/library-linux.sh)

```
wget https://raw.githubusercontent.com/your-org/library/main/library-linux.sh
```

### 2. Run the script

> This script must be run as `root`, or as a user with `sudo` privileges.

    If this is a fresh install, then run the installer by using the following command:

    ```shell
    bash library-linux.sh install
    ```

### 3. Create an account/sign in

    Then visit `http://localhost:3000` and you should be greated with the Sign In page.

## Updating

> This script must be run as `root`, or as a user with `sudo` privileges.

    If Library has previously been installed using this script, then run the updater like so:

    ```shell
     bash library-linux.sh update
    ```

## Services and Ports

`library.target` includes 4 services: `meilisearch.service`, `library-web.service`, `library-workers.service`, `library-browser.service`.

- `meilisearch.service`: Provides full-text search, Library Workers service connects to it, uses port `7700` by default.

- `library-web.service`: Provides the library web service, uses `3000` port by default.

- `library-workers.service`: Provides the library workers service, no port.

- `library-browser.service`: Provides the headless browser service, uses `9222` port by default.

## Configuration, ENV file, database locations

During installation, the script created a configuration file for `meilisearch`, an `ENV` file for Library, and located config paths and database paths separate from the installation path of Library, so as to allow for easier updating. Their names/locations are as follows:

- `/etc/meilisearch.toml` - a basic configuration for meilisearch, that contains configs for the database location, disabling analytics, and using a master key, which prevents unauthorized connections.
- `/var/lib/meilisearch` - Meilisearch DB location.
- `/etc/library/library.env` - The Library `ENV` file. Edit this file to configure Library beyond the default. The web service and the workers service need to be restarted after editing this file:

    ```shell
    sudo systemctl restart library-workers library-web
    ```

- `/var/lib/library` - The Library database location. If you delete the contents of this folder you will lose all your data.

## Still Running Library?

There is a way to upgrade. Please see [Library to Library Migration](../06-administration/08-library-to-library-migration.md)
