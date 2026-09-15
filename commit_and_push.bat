@echo off
set GIT="C:\Users\ASUS\AppData\Local\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd\git.exe"

echo Adding files to git...
%GIT% add -A

echo Committing files...
%GIT% commit -m "Initial commit: Amreshwar Maravi portfolio with scroll-based canvas animation and crimson theme"

echo Commit summary:
%GIT% status
