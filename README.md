# GitHub Star Extension for VS Code

A VS Code extension that displays the GitHub star count of the current project in the status bar.

![star](docs/bar.png)

## Features

- Automatically detects GitHub repository in current workspace
- Displays star count in the status bar in real-time
- Supports manual refresh and automatic periodic refresh
- Configurable GitHub Token and refresh interval
- Customizable click behavior (refresh, open GitHub, or both)

## Usage

1. Open a GitHub project in VS Code
2. The extension will automatically display the star count in the bottom-left status bar
3. Click the status bar item to trigger the configured action

## Configuration

Configure the following options in VS Code settings:

- `github-star.githubToken`: GitHub personal access token (optional, to avoid API rate limits)
- `github-star.refreshInterval`: Auto refresh interval in milliseconds (default: 3600000 - 1 hour)
- `github-star.clickBehavior`: Action to perform when clicking the status bar item
  - `refresh`: Refresh star count
  - `openGitHub`: Open GitHub repository page (default)
  - `refreshAndOpen`: Refresh star count and open GitHub page

### How to Get a GitHub Token

1. Visit https://github.com/settings/tokens
2. Click "Generate new token" -> "Generate new token (classic)"
3. Select the `public_repo` permission
4. Generate the token and copy it
5. Configure `github-star.githubToken` in VS Code settings

## Commands

- `Open GitHub Repository`: Open the repository page in browser
- `Refresh GitHub Stars`: Manually refresh star count
- `Refresh and Open GitHub Repository`: Refresh and open the repository page

## Installation

### Install from Source

1. Clone this repository
2. Run `npm install`
3. Run `npm run compile`
4. Press F5 to start debugging

### Package and Install

```bash
npm install
npm run compile
vsce package
code --install-extension github-star-0.0.1.vsix
```

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Run lint
npm run lint
```
