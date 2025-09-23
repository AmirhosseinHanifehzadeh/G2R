import * as vscode from 'vscode';


export function activate(context: vscode.ExtensionContext) {
	// Register the new command for showing the current Gherkin line
	const validateDocument = (document: vscode.TextDocument) => {
		if (document.languageId !== 'feature' && !document.fileName.endsWith('.feature')) {
			return false;
		}
		return true;
	};

	const validateScenario = (lineText: string) => {
		if (!lineText.includes('Scenario:') && !lineText.includes('Scenario Outline:') || lineText.trim().startsWith('#')) {
			return false;
		}
		return true;
	};

	const parseScenario = (lineText: string) => {
		let result = lineText.trim();
		if (result.startsWith('Scenario:')) {
			result = result.slice('Scenario:'.length).trim();
		}

		if (result.startsWith('Scenario Outline:')) {
			result = result.slice('Scenario Outline:'.length).trim();
		}

		// Replace spaces with underscores and remove/replace problematic characters
		result = result.replace(/ /g, '_');
		// Add backslash before every ( or ) or '
		result = result.replace(/[\(\)']/g, match => '\\' + match);

		return result;
	};

	const findTestFunctionName = (testFilePath: string): string | null => {
		const fs = require('fs');
		const goFileContent = fs.readFileSync(testFilePath, 'utf8');
		const testFuncRegex = /func\s+(Test\w+)\s*\([^)]*\*testing\.T[^)]*\)/;

		const match = testFuncRegex.exec(goFileContent);
		if (match) {
			return match[1];
		}

		return null;
	};

	const findEnvPath = (fullPath: string): string | null => {
		const pathParts = fullPath.split(/[/\\]/);
		let servicePathParts = [...pathParts];
		let lastDir = '';
		while (servicePathParts.length > 0) {
			lastDir = servicePathParts[servicePathParts.length - 1];
			if (lastDir === 'service') {
				return servicePathParts.join('/');
			}
			servicePathParts.pop();
		}
		return null;
	};

	const findPackagePath = (searchPath: string): string | null => {
		const searchPathList = searchPath.split(/[/\\]/);
		const lastDir = searchPathList.pop();
		const generalMarketIndex = searchPathList.indexOf('general-market');
		if (generalMarketIndex !== -1) {
			searchPathList.splice(0, generalMarketIndex + 1);
			return "hs.ir/" + searchPathList.join('/');
		}
		return null;
	};

	const findPackagePathInLocal = (searchPath: string): string | null => {
		const pathParts = searchPath.split(/[/\\]/);
		const lastDir = pathParts.pop();
		return pathParts.join('/');
	};

	const findGoTestFile = (document: vscode.TextDocument): { foundGoFile: string | null, foundGoFilePath: string | null } => {
		const fs = require('fs');
		const path = require('path');

		const fullPath = document.fileName;
		const pathParts = fullPath.split(/[/\\]/);
		let featureFilePath = pathParts.pop();
		let searchPath = pathParts.join('/');

		let foundGoFile = null;
		let foundGoFilePath = null;
		while (true) {
			const files = fs.readdirSync(searchPath);
			for (const file of files) {
				if (file.endsWith('.go')) {
					const goFilePath = require('path').join(searchPath, file);
					const content = fs.readFileSync(goFilePath, 'utf8');
					if (content.includes(featureFilePath)) {
						foundGoFile = file;
						foundGoFilePath = goFilePath;
						break;
					}
				}
			}
			if (foundGoFile) {
				break;
			}
			const lastDir = pathParts.pop();
			searchPath = pathParts.join('/');
			featureFilePath = lastDir + '/' + featureFilePath;
		}
		return { foundGoFile, foundGoFilePath };
	};

	const RunSingleScenario = vscode.commands.registerCommand('GoGherkinRunner.runSingleScenario', (lineNumberFromLens?: number) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}
		const document = editor.document;
		if (!validateDocument(document)) {
			vscode.window.showInformationMessage('This is not a .feature (Gherkin) file.');
			return;
		}

		const lineNumber = typeof lineNumberFromLens === 'number' ? lineNumberFromLens : editor.selection.active.line;
		const lineText = document.lineAt(lineNumber).text;
		if (!validateScenario(lineText)) {
			vscode.window.showInformationMessage('This is not a Scenario line.');
			return;
		}

		const parsedScenario = parseScenario(lineText);
		if (!parsedScenario) {
			vscode.window.showInformationMessage('This is not a Scenario line.');
			return;
		}

		// Find Test File
		const { foundGoFile, foundGoFilePath } = findGoTestFile(document);
		if (!foundGoFile || !foundGoFilePath) {
			vscode.window.showInformationMessage('No .go file containing the feature file path was found up to general-market directory.');
			return;
		}

		// Find Test Function Name
		let functionName = findTestFunctionName(foundGoFilePath);
		if (!functionName) {
			vscode.window.showInformationMessage(`Found .go file: ${foundGoFilePath}, but no test function found.`);
			return;
		}

		// find .env file
		const dotEnvPath = findEnvPath(foundGoFilePath);
		if (!dotEnvPath) {
			vscode.window.showInformationMessage('No .env file found.');
			return;
		}

		const packagePath = findPackagePath(foundGoFilePath);
		if (!packagePath) {
			vscode.window.showInformationMessage('No project path found.');
			return;
		}

		const command = `go test -timeout 30s -run ^${functionName}/${parsedScenario}$ ${packagePath} -benchmem -benchtime 1s -args -dotenv-dir ${dotEnvPath}`;

		// run command in terminal
		let terminal = vscode.window.activeTerminal;
		if (!terminal) {
			terminal = vscode.window.createTerminal('GoGherkinRunner Terminal');
		}
		terminal.show();
		terminal.sendText(command, true);
	});

	context.subscriptions.push(RunSingleScenario);

	// Register the new command for debugging the current Gherkin scenario
	const DebugSingleScenario = vscode.commands.registerCommand('GoGherkinRunner.debugSingleScenario', async (lineNumberFromLens?: number) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}
		const document = editor.document;
		if (!validateDocument(document)) {
			vscode.window.showInformationMessage('This is not a .feature (Gherkin) file.');
			return;
		}

		const lineNumber = typeof lineNumberFromLens === 'number' ? lineNumberFromLens : editor.selection.active.line;
		const lineText = document.lineAt(lineNumber).text;
		if (!validateScenario(lineText)) {
			vscode.window.showInformationMessage('This is not a Scenario line.');
			return;
		}

		const parsedScenario = parseScenario(lineText);
		if (!parsedScenario) {
			vscode.window.showInformationMessage('This is not a Scenario line.');
			return;
		}

		// Find Test File
		const { foundGoFile, foundGoFilePath } = findGoTestFile(document);
		if (!foundGoFile || !foundGoFilePath) {
			vscode.window.showInformationMessage('No .go file containing the feature file path was found up to general-market directory.');
			return;
		}

		// Find Test Function Name
		let functionName = findTestFunctionName(foundGoFilePath);
		if (!functionName) {
			vscode.window.showInformationMessage(`Found .go file: ${foundGoFilePath}, but no test function found.`);
			return;
		}

		// find .env file
		const dotEnvPath = findEnvPath(foundGoFilePath);
		if (!dotEnvPath) {
			vscode.window.showInformationMessage('No .env file found.');
			return;
		}

		const packagePath = findPackagePathInLocal(foundGoFilePath);
		if (!packagePath) {
			vscode.window.showInformationMessage('No project path found.');
			return;
		}

		await vscode.debug.startDebugging(
			undefined,
			{
				name: 'Debug Go Scenario',
				type: 'go',
				request: 'launch',
				mode: 'test',
				program: packagePath,
				args: [
					'-test.run',
					`^${functionName}/${parsedScenario}$`,
					'-dotenv-dir',
					dotEnvPath,
				],
				cwd: packagePath,
			}
		);
	});
	context.subscriptions.push(DebugSingleScenario);

	// Create a Test Controller for GoGherkinRunner
	const testController = vscode.tests.createTestController('GoGherkinRunnerTestController', 'Go Gherkin Scenarios');
	context.subscriptions.push(testController);

	// Focus Testing view with best-effort command discovery (different VS Code versions/editions)
	const focusTestingViewIfAvailable = async () => {
		try {
			const commands = await vscode.commands.getCommands(true);
			const candidates = [
				'workbench.view.testing',
				'workbench.view.extension.test',
				'testing.open',
				'workbench.view.extension.testing',
				'workbench.views.testing.focus'
			];
			for (const id of candidates) {
				if (commands.includes(id)) {
					await vscode.commands.executeCommand(id);
					return;
				}
			}
		} catch {
			// ignore if focusing fails
		}
	};

	// Maintain and discover tests in .feature files
	const getOrCreateFileItem = (uri: vscode.Uri): vscode.TestItem => {
		const id = uri.toString();
		let fileItem = testController.items.get(id);
		if (!fileItem) {
			fileItem = testController.createTestItem(id, uri.path.split('/').pop() || uri.path, uri);
			testController.items.add(fileItem);
		}
		return fileItem;
	};

	const discoverScenariosInDocument = async (document: vscode.TextDocument) => {
		if (!validateDocument(document)) {
			return;
		}
		const fileItem = getOrCreateFileItem(document.uri);
		
		// Clear existing children to avoid stale test items
		fileItem.children.replace([]);
		
		// Find all scenarios and create test items
		const scenarios: { line: number, text: string, id: string }[] = [];
		let scenarioIndex = 0;
		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			if (line.text.trim().startsWith('#')) {
				continue;
			}
			if (line.text.includes('Scenario:') || line.text.includes('Scenario Outline:')) {
				// Create a unique ID based on scenario content and index to avoid collisions
				const scenarioText = line.text.trim();
				const scenarioHash = scenarioText.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15);
				const id = `${document.uri.toString()}#${scenarioIndex}_${scenarioHash}`;
				
				scenarios.push({
					line: i,
					text: scenarioText,
					id: id
				});
				scenarioIndex++;
			}
		}
		
		// Create test items with current line numbers
		scenarios.forEach(scenario => {
			try {
				const scenarioItem = testController.createTestItem(scenario.id, scenario.text, document.uri);
				scenarioItem.range = new vscode.Range(scenario.line, 0, scenario.line, document.lineAt(scenario.line).text.length);
				fileItem.children.add(scenarioItem);
			} catch (error) {
				console.error(`Error creating test item for scenario at line ${scenario.line}:`, error);
			}
		});
	};

	testController.resolveHandler = async (item?: vscode.TestItem) => {
		if (!item) {
			// Discover scenarios for all feature files in the workspace
			const featureFiles = await vscode.workspace.findFiles('**/*.feature');
			await Promise.all(featureFiles.map(async (uri: vscode.Uri) => {
				try {
					const doc = await vscode.workspace.openTextDocument(uri);
					await discoverScenariosInDocument(doc);
				} catch (error) {
					console.error(`Error discovering scenarios in ${uri.fsPath}:`, error);
				}
			}));
			return;
		}
		// If a file node is expanded, refresh its scenarios
		if (item.uri) {
			const doc = await vscode.workspace.openTextDocument(item.uri);
			await discoverScenariosInDocument(doc);
		}
	};

	const enqueueAll = (collection: vscode.TestItemCollection, queue: vscode.TestItem[]) => {
		collection.forEach((child: vscode.TestItem) => {
			if (child.children.size === 0) {
				queue.push(child);
			} else {
				enqueueAll(child.children, queue);
			}
		});
	};

	const runHandler = async (request: vscode.TestRunRequest, token: vscode.CancellationToken, debug: boolean) => {
		const run = testController.createTestRun(request);
		// Removed focusTestingViewIfAvailable() to prevent automatic focus on Testing panel
		const queue: vscode.TestItem[] = [];
		if (request.include) {
			request.include.forEach((test: vscode.TestItem) => queue.push(test));
		} else {
			enqueueAll(testController.items, queue);
		}

		for (const test of queue) {
			if (token.isCancellationRequested) {
				break;
			}
			// Only handle scenario items (leaf nodes with a range)
			if (!test.uri || !test.range) {
				continue;
			}
			if (debug) {
				// For debug profile, keep using existing debug command behavior
				try {
					await vscode.window.showTextDocument(test.uri, { preview: false, preserveFocus: true });
					await vscode.commands.executeCommand('GoGherkinRunner.debugSingleScenario', test.range.start.line);
					run.enqueued(test);
					run.started(test);
					run.passed(test);
				} catch (err: any) {
					run.errored(test, new vscode.TestMessage((err && err.message) || String(err)));
				}
				continue;
			}

			// RUN: execute go test via child_process and capture output
			try {
				const doc = await vscode.workspace.openTextDocument(test.uri);
				const lineNumber = test.range.start.line;
				const lineText = doc.lineAt(lineNumber).text;
				if (!validateScenario(lineText)) {
					run.skipped(test);
					continue;
				}
				const parsedScenario = parseScenario(lineText);
				const { foundGoFilePath } = findGoTestFile(doc);
				if (!foundGoFilePath) {
					run.errored(test, new vscode.TestMessage('No .go file containing the feature file path was found.'));
					continue;
				}
				const functionName = findTestFunctionName(foundGoFilePath);
				if (!functionName) {
					run.errored(test, new vscode.TestMessage(`Found .go file: ${foundGoFilePath}, but no test function found.`));
					continue;
				}
				const dotEnvPath = findEnvPath(foundGoFilePath);
				if (!dotEnvPath) {
					run.errored(test, new vscode.TestMessage('No .env file found.'));
					continue;
				}
				const packagePath = findPackagePath(foundGoFilePath);
				if (!packagePath) {
					run.errored(test, new vscode.TestMessage('No project path found.'));
					continue;
				}

				run.enqueued(test);
				run.started(test);

				const { spawn } = require('child_process');
				const args = ['test', '-timeout', '30s', '-run', `^${functionName}/${parsedScenario}$`, packagePath, '-benchmem', '-benchtime', '1s', '-args', '-dotenv-dir', dotEnvPath];
				const cwd = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath) || undefined;
				const child = spawn('go', args, { cwd });

				let collected = '';
				child.stdout.on('data', (data: any) => {
					const text = data.toString();
					collected += text;
					try { run.appendOutput(text); } catch { }
				});
				child.stderr.on('data', (data: any) => {
					const text = data.toString();
					collected += text;
					try { run.appendOutput(text); } catch { }
				});

				const exitCode: number = await new Promise((resolve) => {
					child.on('close', (code: number) => resolve(code ?? 1));
				});

				if (exitCode === 0) {
					run.passed(test);
				} else {
					const message = new vscode.TestMessage('go test failed\n\n' + collected);
					run.failed(test, message);
				}
			} catch (err: any) {
				run.errored(test, new vscode.TestMessage((err && err.message) || String(err)));
			}
		}
		run.end();
	};

	testController.createRunProfile('Run Scenario', vscode.TestRunProfileKind.Run, (request, token) => runHandler(request, token, false), true);
	testController.createRunProfile('Debug Scenario', vscode.TestRunProfileKind.Debug, (request, token) => runHandler(request, token, true));

	// Command to run a scenario (current file + line) through the Test Explorer flow
	const RunScenarioInExplorer = vscode.commands.registerCommand('GoGherkinRunner.runScenarioInExplorer', async (lineNumberFromLens?: number) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}
		const document = editor.document;
		if (!validateDocument(document)) {
			vscode.window.showInformationMessage('This is not a .feature (Gherkin) file.');
			return;
		}
		const lineNumber = typeof lineNumberFromLens === 'number' ? lineNumberFromLens : editor.selection.active.line;
		await discoverScenariosInDocument(document);
		const fileId = document.uri.toString();
		const fileItem = testController.items.get(fileId);
		if (!fileItem) {
			vscode.window.showInformationMessage('No test items found for this file.');
			return;
		}
		
		// Find the scenario item that matches the current line
		let scenarioItem: vscode.TestItem | undefined;
		fileItem.children.forEach((item) => {
			if (item.range && item.range.start.line === lineNumber) {
				scenarioItem = item;
			}
		});
		
		if (!scenarioItem) {
			vscode.window.showInformationMessage('No test item found for this scenario line.');
			return;
		}
		const cts = new vscode.CancellationTokenSource();
		await runHandler(new vscode.TestRunRequest([scenarioItem]), cts.token, false);
	});
	context.subscriptions.push(RunScenarioInExplorer);

	// Keep tests in sync when feature files change
	const watcher = vscode.workspace.createFileSystemWatcher('**/*.feature');
	context.subscriptions.push(watcher);
	watcher.onDidCreate(async (uri: vscode.Uri) => {
		const doc = await vscode.workspace.openTextDocument(uri);
		await discoverScenariosInDocument(doc);
	});
	watcher.onDidChange(async (uri: vscode.Uri) => {
		const doc = await vscode.workspace.openTextDocument(uri);
		await discoverScenariosInDocument(doc);
	});
	watcher.onDidDelete((uri: vscode.Uri) => {
		const id = uri.toString();
		testController.items.delete(id);
	});

	// Also populate when user opens a .feature file
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(async (doc: vscode.TextDocument) => {
		if (validateDocument(doc)) {
			await discoverScenariosInDocument(doc);
		}
	}));

	// Listen for text document changes to refresh test items
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(async (event: vscode.TextDocumentChangeEvent) => {
		if (validateDocument(event.document)) {
			// Debounce the refresh to avoid too many updates
			setTimeout(async () => {
				await discoverScenariosInDocument(event.document);
			}, 300);
		}
	}));

	// Optional: command to discover all scenarios on demand
	const DiscoverAllFeatures = vscode.commands.registerCommand('GoGherkinRunner.discoverAllFeatures', async () => {
		const featureFiles = await vscode.workspace.findFiles('**/*.feature');
		await Promise.all(featureFiles.map(async (uri: vscode.Uri) => {
			const doc = await vscode.workspace.openTextDocument(uri);
			await discoverScenariosInDocument(doc);
		}));
		vscode.window.showInformationMessage(`Discovered scenarios in ${featureFiles.length} feature files`);
	});
	context.subscriptions.push(DiscoverAllFeatures);

	// Command to refresh test discovery for current file
	const RefreshTestDiscovery = vscode.commands.registerCommand('GoGherkinRunner.refreshTestDiscovery', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}
		const document = editor.document;
		if (!validateDocument(document)) {
			vscode.window.showInformationMessage('This is not a .feature (Gherkin) file.');
			return;
		}
		await discoverScenariosInDocument(document);
		vscode.window.showInformationMessage('Test discovery refreshed for current file');
	});
	context.subscriptions.push(RefreshTestDiscovery);

	// CodeLensProvider for Scenario lines
	class ScenarioCodeLensProvider implements vscode.CodeLensProvider {
		onDidChangeCodeLenses?: vscode.Event<void> | undefined;

		provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
			const codeLenses: vscode.CodeLens[] = [];
			let scenarioCount = 1;
			for (let i = 0; i < document.lineCount; i++) {
				const line = document.lineAt(i);
				if (line.text.trim().startsWith('#')) {
					continue;
				}
				if (line.text.includes('Scenario:') || line.text.includes('Scenario Outline:')) {
					const range = new vscode.Range(i, 0, i, line.text.length);
					codeLenses.push(new vscode.CodeLens(range, {
						title: `$(play)  Run test`,
						command: 'GoGherkinRunner.runSingleScenario',
						arguments: [i]
					}));
					codeLenses.push(new vscode.CodeLens(range, {
						title: `$(debug)  Debug (Scenario ${scenarioCount})`,
						command: 'GoGherkinRunner.debugSingleScenario',
						arguments: [i]
					}));
					scenarioCount++;
				}
			}
			return codeLenses;
		}
	}

	// Register the CodeLensProvider for .feature files
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			[
				{ language: 'feature', scheme: 'file' },
				{ language: 'gherkin', scheme: 'file' }
			],
			new ScenarioCodeLensProvider()
		)
	);

	// DocumentSymbolProvider for Gherkin scenarios (Ctrl+Shift+O)
	class GherkinDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
		provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
			if (!validateDocument(document)) {
				return [];
			}

			const symbols: vscode.DocumentSymbol[] = [];
			let scenarioCount = 1;
			let backgroundSteps: { text: string, line: number }[] = [];
			let inBackground = false;

			for (let i = 0; i < document.lineCount; i++) {
				const line = document.lineAt(i);
				const lineText = line.text.trim();

				// Skip comments
				if (lineText.startsWith('#')) {
					continue;
				}

				// Check for Background section
				if (lineText.startsWith('Background:')) {
					inBackground = true;
					backgroundSteps = [];
					continue;
				}

				// If we're in a background section, collect the steps
				if (inBackground) {
					// Check if we hit a new section (Feature, Scenario, etc.)
					if (lineText.startsWith('Feature:') || lineText.startsWith('Scenario:') || lineText.startsWith('Scenario Outline:')) {
						// End of background section
						inBackground = false;
					} else if (lineText.startsWith('Given') || lineText.startsWith('When') || lineText.startsWith('Then') || lineText.startsWith('And') || lineText.startsWith('But')) {
						// This is a step in the background
						backgroundSteps.push({ text: lineText, line: i });
					}
				}

				// Check for Scenario or Scenario Outline
				if (lineText.includes('Scenario:') || lineText.includes('Scenario Outline:')) {
					// Extract scenario description
					let scenarioDescription = lineText;
					if (scenarioDescription.startsWith('Scenario:')) {
						scenarioDescription = scenarioDescription.slice('Scenario:'.length).trim();
					} else if (scenarioDescription.startsWith('Scenario Outline:')) {
						scenarioDescription = scenarioDescription.slice('Scenario Outline:'.length).trim();
					}

					// Create symbol name with scenario number and description
					const symbolName = `Scenario ${scenarioCount}: ${scenarioDescription}`;

					// Create document symbol
					const symbol = new vscode.DocumentSymbol(
						symbolName,
						lineText,
						vscode.SymbolKind.Method, // Using Method symbol kind for scenarios
						line.range,
						line.range
					);

					symbols.push(symbol);
					scenarioCount++;
				}
			}

			// Add background steps as symbols if they exist
			if (backgroundSteps.length > 0) {
				backgroundSteps.forEach((stepInfo) => {
					const symbolName = `Background >> ${stepInfo.text}`;
					const line = document.lineAt(stepInfo.line);
					const symbol = new vscode.DocumentSymbol(
						symbolName,
						stepInfo.text,
						vscode.SymbolKind.Field, // Using Field symbol kind for background steps
						line.range,
						line.range
					);
					symbols.unshift(symbol); // Add at the beginning
				});
			}

			return symbols;
		}
	}

	// Register the DocumentSymbolProvider for .feature files
	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			[
				{ language: 'feature', scheme: 'file' },
				{ language: 'gherkin', scheme: 'file' }
			],
			new GherkinDocumentSymbolProvider()
		)
	);
}

// This method is called when your extension is deactivated
export function deactivate() { }
