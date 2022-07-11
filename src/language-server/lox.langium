grammar Lox

entry LoxProgram:
    elements+=LoxElement*;

LoxElement: 
    ExpressionBlock | 
    IfStatement |
    WhileStatement |
    ForStatement |
    FunctionDeclaration |
    VariableDeclaration ';' | 
    PrintStatement ';' | 
    ReturnStatement ';' | 
    Expression ';'
;

IfStatement: 
    'if' '(' condition=Expression ')' block=ExpressionBlock
    ('else' elseBlock=ExpressionBlock)?
;

WhileStatement:
    'while' '(' condition=Expression ')' block=ExpressionBlock
;

ForStatement:
    'for' '(' counter=VariableDeclaration? ';' condition=Expression? ';' execution=Expression? ')' block=ExpressionBlock
;

PrintStatement: 'print' value=Expression;

ReturnStatement: 'return' value=Expression;

ExpressionBlock: '{'
    elements+=LoxElement*
'}';

VariableDeclaration returns NamedElement:
    {infer VariableDeclaration} 'var' name=ID ('=' value=Expression)?
;

Expression:
    Addition;

Addition infers Expression:
    Multiplication ({infer BinaryExpression.left=current} operator=('+' | '-') right=Multiplication)*;

Multiplication infers Expression:
    Logical ({infer BinaryExpression.left=current} operator=('*' | '/') right=Logical)*;

Logical infers Expression:
    Comparison ({infer BinaryExpression.left=current} operator=('and' | 'or') right=Comparison)*;

Comparison infers Expression:
    Primary ({infer BinaryExpression.left=current} operator=('<' | '<=' | '>' | '>=' | '==' | '!=') right=Primary)*;

Primary infers Expression:
    '(' Expression ')' |
    UnaryExpression |
    StringExpression |
    BooleanExpression |
    NumberExpression |
    NilExpression |
    MemberCall;

MemberCall:
    // Reference another named element
    element=[NamedElement:ID] 
    // Optionally allow a function call at this point
    ({infer FunctionCall.previous=current} '(' (arguments+=Expression (',' arguments+=Expression)*)? ')')* 
    // Create a chain of membercalls, if the next token is a period
    ({infer MemberCall.previous=current} '.' MemberCall)*
    // Chain into an assignment if we see a `=` symbol
    (assignment?='=' value=Expression)?;

UnaryExpression:
   operator=('!' | '-' | '+') value=Expression
;

NumberExpression: value=NUMBER;
StringExpression: value=STRING;
BooleanExpression: value?='true' | 'false';
NilExpression: value='nil';

FunctionDeclaration returns NamedElement:
    {infer FunctionDeclaration} 'fun' name=ID '(' (parameters+=Parameter (',' parameters+=Parameter)*)? ')' body=ExpressionBlock
;

Parameter returns NamedElement: name=ID;

interface NamedElement {
    name: string
}

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal NUMBER returns number: /[0-9]+(\.[0-9]+)?/;
terminal STRING: /"[^"]*"/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
