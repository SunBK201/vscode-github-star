import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';

let statusBarItem: vscode.StatusBarItem;
let refreshTimer: NodeJS.Timeout | undefined;
let currentRepoInfo: { owner: string; repo: string } | null = null;
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
    console.log('GitHub Star is now active');
    extensionContext = context;

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        0,
    );
    statusBarItem.command = 'github-star.handleClick';
    context.subscriptions.push(statusBarItem);

    // Register click handling command
    const handleClickCommand = vscode.commands.registerCommand('github-star.handleClick', async () => {
        const config = vscode.workspace.getConfiguration('github-star');
        const clickBehavior = config.get<string>('clickBehavior', 'openGitHub');

        switch (clickBehavior) {
            case 'refresh':
                await updateStarCount();
                break;
            case 'openGitHub':
                openGitHubPage();
                break;
            case 'refreshAndOpen':
                await updateStarCount();
                openGitHubPage();
                break;
        }
    });
    context.subscriptions.push(handleClickCommand);

    // Register open GitHub command
    const openGitHubCommand = vscode.commands.registerCommand('github-star.openGitHub', () => {
        openGitHubPage();
    });
    context.subscriptions.push(openGitHubCommand);

    // Register refresh command
    const refreshCommand = vscode.commands.registerCommand('github-star.refresh', () => {
        updateStarCount();
    });
    context.subscriptions.push(refreshCommand);

    // Register refresh and open command
    const refreshAndOpenCommand = vscode.commands.registerCommand('github-star.refreshAndOpen', async () => {
        await updateStarCount();
        openGitHubPage();
    });
    context.subscriptions.push(refreshAndOpenCommand);

    // Initialize display (show cached data first, then fetch latest data asynchronously)
    initializeDisplay();

    // Set up auto refresh
    setupAutoRefresh();

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('github-star.refreshInterval')) {
                setupAutoRefresh();
            }
            if (e.affectsConfiguration('github-star.clickBehavior')) {
                // Update tooltip to reflect new click behavior
                if (currentRepoInfo) {
                    const clickTooltip = getClickBehaviorTooltip();
                    const currentText = statusBarItem.text;
                    if (currentText.includes('$(star)') && !currentText.includes('spin')) {
                        statusBarItem.tooltip = `${currentRepoInfo.owner}/${currentRepoInfo.repo}\n${clickTooltip}`;
                    }
                }
            }
        })
    );
}

async function initializeDisplay() {
    const repoInfo = await getGitHubRepoInfo();
    
    if (!repoInfo) {
        currentRepoInfo = null;
        statusBarItem.hide();
        return;
    }

    currentRepoInfo = repoInfo;
    
    // Try to load from cache first
    const cachedData = getCachedStarCount(repoInfo);
    if (cachedData) {
        statusBarItem.text = `$(star) ${formatNumber(cachedData.stars)}`;
        const clickTooltip = getClickBehaviorTooltip();
        statusBarItem.tooltip = `${repoInfo.owner}/${repoInfo.repo}: ${cachedData.stars} stars\n${clickTooltip}\n(Cached)`;
        statusBarItem.show();
    } else {
        // No cache, show loading state
        statusBarItem.text = `$(star) ${repoInfo.owner}/${repoInfo.repo}`;
        statusBarItem.tooltip = 'Loading star...';
        statusBarItem.show();
    }

    // Try to fetch latest data asynchronously
    updateStarCount();
}

function getCachedStarCount(repoInfo: { owner: string; repo: string }): { stars: number; timestamp: number } | null {
    const cacheKey = `starCount:${repoInfo.owner}/${repoInfo.repo}`;
    const cached = extensionContext.globalState.get<{ stars: number; timestamp: number }>(cacheKey);
    
    if (cached) {
        // Cache is valid for 24 hours
        const cacheAge = Date.now() - cached.timestamp;
        if (cacheAge < 24 * 60 * 60 * 1000) {
            return cached;
        }
    }
    
    return null;
}

function setCachedStarCount(repoInfo: { owner: string; repo: string }, stars: number) {
    const cacheKey = `starCount:${repoInfo.owner}/${repoInfo.repo}`;
    extensionContext.globalState.update(cacheKey, {
        stars: stars,
        timestamp: Date.now()
    });
}

function openGitHubPage() {
    if (currentRepoInfo) {
        const url = `https://github.com/${currentRepoInfo.owner}/${currentRepoInfo.repo}`;
        vscode.env.openExternal(vscode.Uri.parse(url));
    } else {
        vscode.window.showWarningMessage('No GitHub repository found in workspace');
    }
}

function getClickBehaviorTooltip(): string {
    const config = vscode.workspace.getConfiguration('github-star');
    const clickBehavior = config.get<string>('clickBehavior', 'openGitHub');

    switch (clickBehavior) {
        case 'refresh':
            return 'Click to refresh star count';
        case 'openGitHub':
            return 'Click to open GitHub page';
        case 'refreshAndOpen':
            return 'Click to refresh and open GitHub page';
        default:
            return 'Click to open GitHub page';
    }
}

async function updateStarCount() {
    const repoInfo = await getGitHubRepoInfo();

    if (!repoInfo) {
        currentRepoInfo = null;
        statusBarItem.hide();
        return;
    }

    currentRepoInfo = repoInfo;
    statusBarItem.text = '$(sync~spin) Fetching stars...';
    statusBarItem.show();

    try {
        const stars = await fetchGitHubStars(repoInfo.owner, repoInfo.repo);

        // Save to cache
        setCachedStarCount(repoInfo, stars);
        
        statusBarItem.text = `$(star-full) ${formatNumber(stars)}`;
        const clickTooltip = getClickBehaviorTooltip();
        statusBarItem.tooltip = `${repoInfo.owner}/${repoInfo.repo}: ${stars} stars\n${clickTooltip}`;
        statusBarItem.show();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        statusBarItem.text = '$(star-full) Error';
        statusBarItem.tooltip = `Failed to fetch stars: ${errorMessage}`;
        statusBarItem.show();
        console.error('Error fetching GitHub stars:', error);
    }
}

async function getGitHubRepoInfo(): Promise<{ owner: string; repo: string } | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return null;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const gitConfigPath = path.join(workspacePath, '.git', 'config');

    if (!fs.existsSync(gitConfigPath)) {
        return null;
    }

    try {
        const gitConfig = await fs.promises.readFile(gitConfigPath, 'utf-8');

        // Match GitHub URL
        const urlRegex = /url\s*=\s*(?:https:\/\/github\.com\/|git@github\.com:)([^\/\s]+)\/([^\s\.]+?)(?:\.git)?$/m;
        const match = gitConfig.match(urlRegex);

        if (match) {
            return {
                owner: match[1],
                repo: match[2]
            };
        }
    } catch (error) {
        console.error('Error reading git config:', error);
    }

    return null;
}

async function fetchGitHubStars(owner: string, repo: string): Promise<number> {
    const config = vscode.workspace.getConfiguration('github-star');
    const token = config.get<string>('githubToken');

    /* eslint-disable @typescript-eslint/naming-convention */
    const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'VSCode-GitHub-Star-Counter'
    };
    /* eslint-enable @typescript-eslint/naming-convention */

    if (token) {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers.Authorization = `token ${token}`;
    }

    const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers }
    );

    return response.data.stargazers_count;
}

function formatNumber(num: number): string {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function setupAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }

    const config = vscode.workspace.getConfiguration('github-star');
    const interval = config.get<number>('refreshInterval', 3600000);

    if (interval > 0) {
        refreshTimer = setInterval(() => {
            updateStarCount();
        }, interval);
    }
}

export function deactivate() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
}
