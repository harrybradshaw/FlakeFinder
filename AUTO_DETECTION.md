# Auto-Detection Feature

## Overview

The upload dialog now automatically extracts and pre-fills metadata from Playwright HTML reports, making uploads faster and reducing manual entry errors.

## How It Works

### 1. **File Selection**

When you select a ZIP file containing a Playwright HTML report:

1. The ZIP is parsed in the browser (no server upload yet)
2. The embedded report data is extracted
3. CI metadata is read from `report.json`
4. Form fields are automatically populated

### 2. **What Gets Auto-Detected**

#### **Filename Detection** (Priority 1) 📝

The system first checks the filename for hints:

**Environment Detection:**

- `playwright-report-production.zip` → **production**
- `test-results-staging.zip` → **staging**
- `report-dev.zip` → **development**
- Keywords: `production`, `prod`, `staging`, `stage`, `development`, `dev`

**Trigger Detection:**

- `results-merge-queue.zip` → **merge_queue**
- `report-pr.zip` → **pull_request**
- `tests-post-deploy.zip` → **post_deploy**
- `results-ci.zip` → **ci**
- Keywords: `merge-queue`, `merge_queue`, `pull-request`, `pull_request`, `pr`, `post-deploy`, `post_deploy`, `ci`
- **Default**: `merge_queue` (if no keywords found)

#### **Commit Hash** ✅ (From report metadata)

- Extracted from: `metadata.ci.commitHash`
- Example: `16c08c2e4fb74181a355447e850f132198ed98c3`
- **Always detected** if running in GitHub Actions

#### **Branch** 🔍 (From report metadata)

- Extracted from: Commit URL or defaults to `main`
- Example: `main`, `develop`, `feature/new-thing`
- **Detection**: Tries to parse from GitHub commit URL
- **Fallback**: Defaults to `main`

#### **Environment** 🎯 (Fallback if not in filename)

- Inferred from: Branch name patterns
- Logic:
  - `main`, `master`, or contains `prod` → **production**
  - Contains `staging` or `stage` → **staging**
  - Everything else → **development**

#### **Trigger** 🚀 (Fallback if not in filename)

- Inferred from: GitHub Actions URL patterns
- Logic:
  - URL contains `pull_request` → **pull_request**
  - URL contains `workflow_dispatch` → **ci**
  - Default → **merge_queue**

### 3. **User Experience**

**During Auto-Detection:**

```
🔍 Auto-detecting metadata...
```

File input is disabled while processing (usually <1 second)

**After Successful Detection:**

```
✨ Metadata auto-detected! Review and edit if needed.
```

All fields are populated but **still editable**

**Fields Remain Editable:**

- You can change any auto-detected value
- Useful if detection is wrong
- Or if you want different categorization

## Example Flow

### Before (Manual Entry)

1. Select file
2. Type environment: "staging"
3. Select trigger: "ci"
4. Type branch: "main"
5. Copy/paste commit: "16c08c2..."
6. Click Upload

### After (Auto-Detection)

1. Select file
2. ✨ All fields filled automatically
3. Review (maybe change environment)
4. Click Upload

## Technical Details

### Browser-Side Processing

```typescript
// Parses ZIP in browser using JSZip
const zip = await JSZip.loadAsync(file);

// Extracts embedded report data
const htmlFile = zip.file("index.html");
const match = htmlContent.match(/window\.playwrightReportBase64/);

// Decodes and parses report.json
const reportData = JSON.parse(reportContent);
const metadata = reportData.metadata?.ci;
```

### No Server Upload Yet

- Detection happens **before** upload
- Fast (browser-side only)
- No network traffic until you click "Upload"
- Safe - file stays local during detection

### Fallback Behavior

If detection fails:

- No error shown
- Fields remain empty
- User fills manually as before
- Upload works normally

## Smart Inference Rules

### Environment Inference

```
Branch "main" → production
Branch "staging-deploy" → staging
Branch "feature/new-thing" → development
```

### Trigger Inference

```
GitHub Actions PR workflow → pull_request
GitHub Actions workflow_dispatch → ci
Unknown/default → ci
```

## Benefits

### 🚀 **Speed**

- 90% less typing
- One-click form completion
- Faster uploads

### ✅ **Accuracy**

- No typos in commit hash
- Correct branch name
- Consistent categorization

### 🎯 **Convenience**

- Works automatically
- No configuration needed
- Still allows overrides

### 🔒 **Privacy**

- All processing in browser
- No data sent until upload
- Original file unchanged

## Limitations

### What's NOT Auto-Detected

- **Custom environments** - Only detects production/staging/development
- **Custom triggers** - Only detects common CI triggers
- **Manual test runs** - No CI metadata available

### When It Doesn't Work

- **JSON reports** - Only works with HTML/ZIP reports
- **Old reports** - Playwright reports without CI metadata
- **Non-GitHub CI** - Only GitHub Actions metadata supported

### Workarounds

If auto-detection doesn't work or gives wrong values:

1. Simply edit the fields manually
2. Detection is a helper, not required
3. All fields remain fully editable

## Recommended Filename Conventions

To get the best auto-detection results, use descriptive filenames:

### ✅ Good Examples:

```
playwright-report-staging-merge-queue.zip
test-results-production-ci.zip
e2e-tests-dev-pr.zip
playwright-report-staging-post-deploy.zip
results-production-merge-queue.zip
```

### ❌ Avoid:

```
report.zip                    → Uses all defaults
test-results.zip              → No context
playwright-report-123.zip     → No environment/trigger info
```

### 💡 Naming Pattern:

```
[tool]-[type]-[environment]-[trigger].zip

Examples:
- playwright-report-staging-merge-queue.zip
- e2e-results-production-ci.zip
- test-report-dev-pr.zip
```

## Future Enhancements

Potential improvements:

- Support more CI providers (GitLab, CircleCI, etc.)
- Custom environment mapping
- Remember user preferences
- Batch upload with auto-detection
- Show what was detected vs defaulted
- Admin page for custom trigger/environment values
