#! /bin/bash
cmd_todo="grep -R -c TODO lib public sass app.js app"
cmd_fixme="grep -R -c FIXME lib public sass app.js app"
cmd_docu="grep -R -c DOCU lib public sass app.js app"


todo=$($cmd_todo | awk -F ':' '{sum += $2} END {print sum}')
fixme=$($cmd_fixme | awk -F ':' '{sum += $2} END {print sum}')
docu=$($cmd_docu | awk -F ':' '{sum += $2} END {print sum}')

if [[ $1 == "--verbose" || $1 == "-v" ]]; then
  if [[ $todo -ne 0 ]]; then
    echo "TODO annotations"
    echo "----------------"
    $cmd_todo | grep -v ":0"
  fi

  if [[ $fixme -ne 0 ]]; then
    echo
    echo "FIXME annotations"
    echo "----------------"
    $cmd_fixme | grep -v ":0"
    echo
  fi

  if [[ $docu -ne 0 ]]; then
    echo "DOCU annotations"
    echo "----------------"
    $cmd_docu | grep -v ":0"
    echo
  fi

  echo
  echo
fi

echo "Annotation counts:"
echo
echo "Total TODO tags : $todo"
echo "Total FIXME tags: $fixme"
echo "Total DOCU tags : $docu"
