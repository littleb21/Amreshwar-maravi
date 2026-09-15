@echo off
set PATH=C:\Users\ASUS\AppData\Local\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd;C:\Users\ASUS\AppData\Local\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin;%PATH%

echo Merging remote with ours preference...
git.exe merge origin/main --allow-unrelated-histories -s ort -X ours -m "Merge initial remote commit"

echo Git status after merge:
git.exe status

echo Pushing to GitHub...
git.exe push -u origin main
