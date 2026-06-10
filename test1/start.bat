@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 개인 PMS

REM node 가 PATH 에 없으면 기본 설치 경로를 사용
where node >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=%PATH%;C:\Program Files\nodejs"
  ) else (
    echo Node.js 를 찾을 수 없습니다. 설치 여부를 확인해주세요.
    pause
    exit /b 1
  )
)

echo 개인 PMS 를 시작합니다... 잠시만 기다려주세요.
node server.js

echo.
echo 서버가 종료되었습니다.
pause
