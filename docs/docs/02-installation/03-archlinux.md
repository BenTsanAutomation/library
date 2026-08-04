# Arch Linux

## Installation

> [Library on AUR](https://aur.archlinux.org/packages/library) is not maintained by the library official.

1. Install library

    ```shell
    paru -S library
    ```

2. (**Optional**) Install optional dependencies

    ```shell
    # library-cli: library cli tool
    paru -S library-cli

    # ollama: for automatic tagging
    sudo pacman -S ollama

    # yt-dlp: for download video
    sudo pacman -S yt-dlp
    ```

    You can use Open-AI instead of `ollama`. If you use `ollama`, you need to download the ollama model. Please refer to: [https://ollama.com/library](https://ollama.com/library).

3. Set up

    Environment variables can be set in `/etc/library/library.env` according to [configuration page](../03-configuration/01-environment-variables.md). **The environment variables that are not specified in `/etc/library/library.env` need to be added by yourself.**

4. Enable service

    ```shell
    sudo systemctl enable --now library.target
    ```

    Then visit `http://localhost:3000` and you should be greated with the sign in page.

## Services and Ports

`library.target` include 3 services: `library-web.service`, `library-works.service`, `library-browser.service`.

- `library-web.service`: Provide library webui service, uses `3000` port by default.

- `library-workers.service`: Provide library workers service, no port.

- `library-browser.service`: Provide browser headless service, uses `9222` port by default.

Now `library` depends on `meilisearch`, and `library-workers.service` wants `meilisearch.service`, starting `library.target` will start `meilisearch.service` at the same time.

## How to Migrate from Library to Library

The PKGBUILD has been fully updated to replace all references to `library` with `library`. If you want to preserve your existing `library` data during the upgrade, please follow the steps below:

**1. Stop the old services**

```shell
sudo systemctl stop library-web.service library-worker.service library-browser.service
sudo systemctl disable --now library.target
```

**2. Uninstall Library**  
After uninstalling, you can manually remove the old `library` user and group if needed.
```shell
paru -R library
```

**3. Rename the old data directory**
```shell
sudo mv /var/lib/library /var/lib/library
```

**4. Install Library**
```shell
paru -S library
```

**5. Fix ownership of the data directory**
```shell
sudo chown -R library:library /var/lib/library
```

**6. Set Library**  
Edit `/etc/library/library.env` according to [configuration page](../03-configuration/01-environment-variables.md). **The environment variables that are not specified in `/etc/library/library.env` need to be added by yourself.**

Or you can copy old library env file to library:
```shell
sudo cp -f /etc/library/library.env /etc/library/library.env
```

**7. Start Library**
```shell
sudo systemctl enable --now library.target
```
