@echo off
set GIT="C:\Users\ASUS\AppData\Local\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd\git.exe"

%GIT% config user.name "Amreshwar Maravi"
%GIT% config user.email "amreshwarsingh0750@gmail.com"
%GIT% branch -M main
%GIT% remote remove origin 2>nul
%GIT% remote add origin https://github.com/littleb21/Amreshwar-maravi.git
%GIT% remote -v
%GIT% status
